'use strict';
/*jshint latedef:false */

/* Setting up server process and client process, which gives ~8K concurrent
sysctl -a | grep maxfiles  # display maxfiles and maxfilesperproc  defaults 12288 and 10240
sudo sysctl -w kern.maxfiles=25000
sudo sysctl -w kern.maxfilesperproc=24500
sysctl -a | grep somax # display max socket setting, default 128
sudo sysctl -w kern.ipc.somaxconn=20000  # set
ulimit -S -n       # display soft max open files, default 256
ulimit -H -n       # display hard max open files, default unlimited
ulimit -S -n 20000  # set soft max open files
 */

var async = require('async');
var http = require('http');
var https = require('https');
var measured = require('measured');
var request = require('request');
var EventEmitter = require('events').EventEmitter;
var uuidv4 = require('uuid/v4');
let isNullOrEmpty = require('is-null-or-empty');

var SUBSTITUTED_KEYS = ['get', 'head', 'put', 'post', 'del', 'json', 'body', 'patch'];

function benchmark(flow, runOptions) {
  if (!runOptions || !runOptions.iterations || !runOptions.limit) {
    throw new Error('benchmark runOptions requires iterations and limit properties');
  }
  if (!runOptions.prealloc) runOptions.prealloc = 100000; // default
  if (runOptions.prealloc > runOptions.iterations) runOptions.prealloc = runOptions.iterations; // cap at iterations

  flow = ensureFlowProperties(flow);
  var emitter = new EventEmitter();
  var errorCount = 0;
  var index = 0;
  var concurrentCount = 0; // concurrent tasks at any point in time
  var stats = measured.createCollection();
  var elapsed_timer = stats.timer('totalElapsed').start();

  function emitProgress() {
    var statsObj = stats.toJSON();
    var percent = (statsObj.main) ? Math.round(statsObj.main.meter.count * 100 / runOptions.iterations) : 0;
    var ips = (statsObj.main) ? Math.round(statsObj.main.meter.currentRate) : 0; // current iterations per second
    emitter.emit('progress', statsObj, percent, concurrentCount, ips);
  }
  var progressTimer = (runOptions.progress) ? setInterval(emitProgress, runOptions.progress) : null;

  function handleError(err, ctxName, exit) {
    errorCount++;
    emitter.emit('error', err, ctxName);
    if (exit) {
      shutdown();
      emitter.emit('end', stats, errorCount);
    }
  }

  http.globalAgent.maxSockets = runOptions.limit;
  https.globalAgent.maxSockets = runOptions.limit;

  function run(task, cb) {
    concurrentCount += 1;
    task.env.group = 'beforeMain';
    performActions(task.env, task.beforeMain, function (err) {
      if (err) {
        handleError(err, 'beforeMain');
        concurrentCount -= 1;
        return cb(err);
      }
      var req_timer = stats.timer('main').start();
      task.env.group = 'main';
      performActions(task.env, task.main, function (err) {
        req_timer.end();
        if (err) {
          handleError(err, 'main');
        }
        task.env.group = 'afterMain';
        performActions(task.env, task.afterMain, function (err) {
          if (err) {
            handleError(err, 'afterMain');
            concurrentCount -= 1;
            return cb(err);
          }
          concurrentCount -= 1;
          cb();
        });
      });
    });
    checkIfNeedToPush();
  }

  function shutdown() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    stats.end();
  }

  var queue = async.queue(run, runOptions.limit);

  queue.drain = function () {
    performActions({ group: 'after', user: runOptions.user, password: runOptions.password  }, flow.after, function (err) {
      elapsed_timer.end();
      if (err) {
        handleError(err, 'after');
      }
      shutdown();
      var statsObj = stats.toJSON(); // actually materializes object
      statsObj.totalElapsed = statsObj.totalElapsed.histogram.max; // simplify the elapsed to single number
      emitter.emit('end', statsObj, errorCount);
    });
  };

  function pushOnQueue() {
    var tokens = {
      INDEX: index
    };
    queue.push({
      env: { index: index, jar: request.jar(), user: runOptions.user, password: runOptions.password, etags: {}, iterCtx: {}, stats: stats },
      beforeMain: bindSubtituteFnsWithTokens(flow.beforeMain, tokens),
      main: bindSubtituteFnsWithTokens(flow.main, tokens),
      afterMain: bindSubtituteFnsWithTokens(flow.afterMain, tokens)
    });
    index += 1;
  }

  function checkIfNeedToPush() {
    if (index < runOptions.iterations) {
      pushOnQueue();
    }
  }

  process.nextTick(function () { // allow event handlers to be hooked up before starting

    performActions({ group: 'before', user: runOptions.user, password: runOptions.password }, flow.before, function (err) {
      if (err) {
        return handleError(err, 'before', true);  // exit if fails here
      }

      // create optimized substitution fns for each flow where needed
      flow.beforeMain = substituteFnWhereNeeded(flow.beforeMain,runOptions.dynamicInputArrays);
      flow.main = substituteFnWhereNeeded(flow.main,runOptions.dynamicInputArrays);
      flow.afterMain = substituteFnWhereNeeded(flow.afterMain,runOptions.dynamicInputArrays);

      try {
        for (var i = 0; i < runOptions.prealloc; i++) {
          pushOnQueue();
        }
      } catch (err) {
        handleError(err, 'queuing');
      }
    });

  });

  return emitter;
}

function ensureFlowProperties(flow) {
  if (!flow) flow = {};
  if (typeof flow === 'string') flow = { main: [{ get: flow }] }; // allow URL only as main GET flow
  if (Array.isArray(flow)) flow = { main: flow }; // allow passing just main ops as flow
  if (!flow.main && !flow.before && !flow.after && !flow.beforeMain && !flow.afterMain &&
      Object.keys(flow).length) {
    // assuming if none of these properties exist but does have properties
    //that this is a single operation as the main
    flow = { main: [flow] };
  }

  if (!Array.isArray(flow.main)) {
    throw new Error('benchmark flow requires main operations, missing flow.main?');
  }

  if (!flow.before) flow.before = [];
  if (!flow.after) flow.after = [];
  if (!flow.beforeMain) flow.beforeMain = [];
  if (!flow.afterMain) flow.afterMain = [];
  return flow;
}

function getRequestOptions(env, action) {
  // just using action and update in place
  action.jar = env.jar;
  if (!action.headers) action.headers = {};
  action.headers.Connection = 'keep-alive';
  if (env.user) { // if user provided, add basic auth authentication
    action.headers.Authorization = 'Basic ' + new Buffer(env.user + ':' + env.password).toString('base64');
  }
  if (action.get) {
    action.method = 'GET';
    action.uri = action.get;
  } else if (action.head) {
    action.method = 'HEAD';
    action.uri = action.head;
  } else if (action.put) {
    action.method = 'PUT';
    action.uri = action.put;
  } else if (action.post) {
    action.method = 'POST';
    action.uri = action.post;
  } else if (action.del) {
    action.method = 'DELETE';
    action.uri = action.del;
  } else if (action.patch) {
    action.method = 'PATCH';
    action.uri = action.patch;
  }
  return action;
}

var CORE_HOOKS = {
  useEtag: function (all) {
    if (all.env.etags && all.env.etags[all.requestOptions.uri]) {
      var headerName = (all.requestOptions.get || all.requestOptions.head) ? 'If-None-Match' : 'If-Match';
      all.requestOptions.headers[headerName] = all.env.etags[all.requestOptions.uri];
    }
    return all;
  },
  saveEtag: function (all) {
    var res = all.response;
    if (!all.err && res.statusCode >= 200 && res.statusCode < 300 && res.headers.etag) {
      // if POST returned Location use it for ETag URI, not original URI
      var uri = (all.requestOptions.method === 'POST' && res.headers.location) ?
        res.headers.location :
        all.requestOptions.uri;
      if (!all.env.etags) all.env.etags = {};
      all.env.etags[uri] = res.headers.etag;
    }
    return all;
  },
  ignoreStatus: function (all) {
    if (!all.err && all.response.statusCode >= 400) all.response.statusCode = 200;
    return all;
  },
  verify2XX: function (all) {
    if (!all.err) { // no previous error
      var statusCode = all.response.statusCode;
      if (statusCode < 200 || statusCode > 299) {
        throw new Error('statusCode was not in 200-299 range, statusCode: ' + statusCode);
      }
    }
    return all;
  },
  startStepTimer: function (all) {
    if (!all.iterCtx.stepTimers) {
      // create map for step timers if doesn't exist
      all.iterCtx.stepTimers = {};
    }
    // create timer for this step and store in stepTimers[step_xyz]
    var timerName = 'step_'+all.opIndex; // step_0, step_1, ...
    all.iterCtx.stepTimers[all.opIndex] = all.env.stats.timer(timerName).start();
    return all;
  },
  endStepTimer: function (all) {
    // stop timer previously created for step in startStepTimer
    all.iterCtx.stepTimers[all.opIndex].end();
    return all;
  }
};

function identityHook(all) { return all; }

function processHooks(hookName, all) {
  var hooks = all.requestOptions[hookName] || [];
  if (!hooks.length) return all;
  hooks = hooks.map(function (hook) { // substitute core hooks
    if (typeof hook === 'string') hook = CORE_HOOKS[hook];
    if (!hook) hook  = identityHook;
    return hook;
  });
  try {
    all = hooks.reduce(function (accum, hook) { return hook(accum); }, all);
    return all;
  } catch (err) {
    all.cb(err);
    return false; // already handled exit
  }
}

function performActions(env, actionArr, cb) {
  actionArr = execAnySubFns(actionArr); // run any substitionFns so just have values
  var performActionWithEnv = performAction.bind(null, env);
  async.reduce(actionArr, 0, performActionWithEnv, cb);
}

function performAction(env, opIndex, action, cb) {
  env.actionName = env.group + '_' + opIndex;
  var all = {
    env: env,
    opIndex: opIndex,
    iterCtx: env.iterCtx, // for user storage
    requestOptions: getRequestOptions(env, action),
    err: null,
    cb: cb
  };
  all = processHooks('beforeHooks', all);
  if (!all) return; // already handled
  var req = request(all.requestOptions, function (err, res, body) {
    all.err = err;
    all.response = res;
    all.body = body;
    all = processHooks('afterHooks', all);
    if (!all) return; // already handled
    if (all.err) return all.cb(all.err);
    if (all.response.statusCode >= 400) return all.cb(new Error('error statusCode: ' + all.response.statusCode));
    all.cb(null, opIndex + 1);
  });
  if (!all.requestOptions.formData) req.start(); // cant if has formData
}

/**
 * determines if a property needs substitution
 * @returns boolean true if needs substition
 */
function needsSubtitution(prop) {
  var needsSub = false;
  if (typeof prop === 'string') {
    if (prop.indexOf('#{INDEX}') !== -1) needsSub = true;
  } else if (typeof prop === 'object') {
    var str = JSON.stringify(prop);
    if (str.indexOf('#{INDEX}') !== -1) needsSub = true;
  }
  return needsSub;
}
/**
 * determines if a property needs GUID substitution
 * @returns boolean true if needs GUID substition
 */
function needsGUIDSubtitution(prop) {
  var needsSub = false;
  if (typeof prop === 'string') {
    if (prop.indexOf('#{GUID}') !== -1) needsSub = true;
  } else if (typeof prop === 'object') {
    var str = JSON.stringify(prop);
    if (str.indexOf('#{GUID}') !== -1) needsSub = true;
  }
  return needsSub;
}

/**
 * determines if a property needs substitution from inputarray
 * @returns null if no needs for substition, otherwise the array of indexes
 * @example {'http://localhost:8000/foo_#{INDEX.1}' ,  json=#{INDEX.2}} -> returns [["#{INDEX.1}", "1"],["#{INDEX.2}", "2"]]
 * @example {'http://localhost:8000/foo_#{INDEX}' ,  json=#{INDEX.1}} -> returns [["#{INDEX.1}", "1"]]
 * @author Yosef Benraz, 4public@benraz.com 
 */
function needsInputArraySubtitutions(prop) {
  let str = "";
  if (typeof prop === 'string') {
    str = prop
  } else if (typeof prop === 'object') {
    str = JSON.stringify(prop);    
  }  
  let express  = /\#\{INDEX\.((\w+)(\d?))\}/g;  
  let matches = [];
  let match;
  while (match = express.exec(str)) {
    matches.push(match);
  }

  return matches;
}

/**
 * Replace all the '#{INDEX.XX}' by the corresponding input data from runOptions.dynamicInputArrays 
 * @param {the property that need substitution} prop 
 * @param {*} INDEX 
 * @param {*} inputarrayIndexes 
 * @author Yosef Benraz, 4public@benraz.com 
 */
function replaceSubstitutions(prop,index,inputarrayIndexes,dynamicInputArrays){
  let str = prop;
  let Inputdata;
  try{
      //run all over the inputarrayIndexes (index.#) , and replace correspondly
      inputarrayIndexes.forEach(element => {
        if(element){      
          let dynamicInputarray = dynamicInputArrays[element[1]];
          if(index < dynamicInputarray.length){
            Inputdata = dynamicInputarray[index];
          }else{
            Inputdata = dynamicInputarray[dynamicInputarray.length-1];//last one
          }
          if(dynamicInputarray){
              let expression  = new RegExp(element[0],'g');         
              str = str.replace(expression, Inputdata);      
              //console.log("replaceSubstitutions.str ="+ str);         
            }
          }
      }); 
  } catch (err) {
    console.log("replaceSubstitutions exception: "+err);
  }
  
  return str;
}
/**
 * create modified actions object which has substituteFns for any keys that
 * are using substitution. These substituteFns have one argument `tokens` which
 * will be bound to them in the queuing loop, so at runtime, the fn will be
 * executed and returns the proper value.
 *
 * Keys which do not need substitution, will be returned untouched and thus
 * will save the overhead of needing replacement and stringify/parse (json)
 *
 * If adding keys, be sure to update the SUBSTITUTED_KEYS constant.
 *
 * @returns actions object with replacements done as necessary
 */
function substituteFnWhereNeeded(actions,dynamicInputArrays) {
  actions = actions || [];
  return actions.map(function (action) {
    return Object.keys(action).reduce(function (accum, key) {

      let needsSub = needsSubtitution(action[key]); 
      let needGuidsub = needsGUIDSubtitution(action[key]); 
      let needinputArraySub = false; // if there are any dynamic input from dynamicInputArrays required
      let arraysIndexs = needsInputArraySubtitutions(action[key]); //return the index.XX list 
      if(arraysIndexs && arraysIndexs.length>0){
        needinputArraySub = true;
      }

      if ((key === 'get' || key === 'head' || key === 'put' || key === 'post' || key === 'del' || key === 'patch') &&
      (needsSub||needGuidsub||needinputArraySub)) {
          if(needsSub||needGuidsub||needinputArraySub){
            accum[key] = function (tokens) {
              let result = action[key];
              if(needsSub){
                result = result.replace(/\#\{INDEX\}/g, tokens.INDEX);                
              }
              if(needGuidsub){                
                  let guid = uuidv4();
                  console.log("guid = "+guid);
                  result = result.replace(/\#\{GUID\}/g, guid);
              }
              if(needinputArraySub){
                result = replaceSubstitutions(result,tokens.INDEX,arraysIndexs,dynamicInputArrays);                
              }
              console.log("replaceSubstitutions.result : " + result);
              return result;
            };
          }
      }
      else if (key === 'json' && (needsSub||needGuidsub||needinputArraySub)) {
        if(needsSub||needGuidsub||needinputArraySub){            
            accum[key] = function (tokens) {
              let result = JSON.stringify(action[key]);
              if(isNullOrEmpty(result)){
                return accum[key];
              }
              if(needsSub){
                result = result.replace(/\#\{INDEX\}/g, tokens.INDEX);                
              }
              if(needGuidsub){
                  let guid = uuidv4();
                  console.log("guid = "+guid);
                  result = result.replace(/\#\{GUID\}/g, guid);
              }
              if(needinputArraySub){
                result =  replaceSubstitutions(result,tokens.INDEX,arraysIndexs,dynamicInputArrays);
              }              
              console.log("replaceSubstitutions.result : " + result);
              return JSON.parse(result);
            };
          }
        }
      else if (key === 'body' && typeof action.body === 'string' && (needsSub||needinputArraySub)) {
        if(needsSub||needGuidsub||needinputArraySub){
          accum[key] = function (tokens) {
            let result = action[key];
            if(needsSub){
              result = result.replace(/\#\{INDEX\}/g, tokens.INDEX);                
            }
            if(needGuidsub){                
                let guid = uuidv4();
                console.log("guid = "+guid);
                result = result.replace(/\#\{GUID\}/g, guid);
            }
            if(needinputArraySub){
              result = replaceSubstitutions(result,tokens.INDEX,arraysIndexs,dynamicInputArrays);                
            }
            console.log("replaceSubstitutions.result : " + result);
            return result;
          };
        }
      } else {
        accum[key] = action[key];
      }
      return accum;
    }, {});
  });
}

/**
  if any of the action properties that allow substitution are fns, then
  bind the tokens to the fn, so when executed it will have proper value
  @returns actions with fns bound
  */
function bindSubtituteFnsWithTokens(actions, tokens) {
  return actions.map(function (action) {
    return Object.keys(action).reduce(function (accum, key) {

      /*let needsSub = needsSubtitution(action[key]); 
      let needGuidsub = needsGUIDSubtitution(action[key]); 
      let needinputArraySub = false; // if there are any dynamic input from dynamicInputArrays required
      let arraysIndexs = needsInputArraySubtitutions(action[key]); //return the index.XX list 
      if(arraysIndexs && arraysIndexs.length>0){
        needinputArraySub = true;
      }
      var tokensN = {
        INDEX: tokens.INDEX, 
        NeedsSub: needsSub, 
        NeedGuidsub: needGuidsub,
        NeedinputArraySub: needinputArraySub
      };*/
      // if it is list of sub keys, and is a fn, then bind with tokens
      if (SUBSTITUTED_KEYS.indexOf(key) !== -1 && typeof action[key] === 'function') {
        accum[key] = action[key].bind(null, tokens);
      } else {
        accum[key] = action[key];
      }
      return accum;
    }, {});
  });
}

/**
  If any substitutions need to be done, the properties will be
  replaced with a fn which has been bound to tokens, so exec the
  fn and return the value for the property
  @returns actions with values ready for use
  */
function execAnySubFns(actions) {
  return actions.map(function (action) {
    return Object.keys(action).reduce(function (accum, key) {
      // if it is list of sub keys, and is a fn, then bind with tokens
      if (SUBSTITUTED_KEYS.indexOf(key) !== -1 && typeof action[key] === 'function') {
        accum[key] = action[key](); // exec fn to get value
      } else {
        accum[key] = action[key];
      }
      return accum;
    }, {});
  });
}



module.exports = benchmark;
