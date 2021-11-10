require('dotenv').config({"path":process.cwd()+"\\process.env"}); // load the process evironment
const os = require('os'); 
const Koa = require('koa');
const compose = require('koa-compose');
const koaBody  = require('koa-body');
const bodyParser = require('koa-bodyparser');
const makeDir = require('make-dir');
const Bench  = require('./benchsource/bensh_rest_wrapper');
let config = require('./config');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, /*label,*/ printf } = format;

const app = new Koa();
app.use(koaBody());
app.use(bodyParser());

let bench = new Bench();

///// configure the LOG ////////////

makeDir(config.service.logfilepath).then(path => {
  console.log(path);
  //=> '/Users/sindresorhus/fun/unicorn/rainbow/cake'
});

const myFormat = printf(info => {
 // return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
 return `{"timestamp": "${info.timestamp}", "level": "${info.level}",  "message": "${info.message}"}`;
});
// Configure the Logger
const logger = createLogger({
  level: 'info',
  format: combine(
     // label({ label: 'right meow!' }),
      timestamp(),
      format.json(),
      myFormat
    ),
  
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log` 
    // - Write all logs error (and below) to `error.log`.
    //
    new transports.File({ 
      filename: config.service.logfilepath + 'error - ' + os.hostname() +'.log',
      timestamp: true,
      level: 'error',
      handleExceptions: true,
      exitOnError: false,
      humanReadableUnhandledException: true,
      json: true }),
    new transports.File({ filename: config.service.logfilepath + 'combined - ' + os.hostname() +'.log',
      timestamp: true,
      handleExceptions: true,
      exitOnError: false,
      humanReadableUnhandledException: true,
      json: true  })
  ]
});

///// End configure the LOG ////////////


async function isAlive(ctx, next) {
  if ('/isAlive' == ctx.path) {   
    logger.info('isAlive called');
    ctx.body = 'OK'
    ctx.status = 200;
  } else {
    await next();
  }
};

//This API return a string of instruction for developers,  how to use this services
async function help(ctx, next) {
  if ('/help' == ctx.path) {
    logger.info('help called');
    ctx.body = "this service have 1 API called 'benchmark' (POST), that take json with 2 objects:\n"+
                "{runOptions: { ... },\n"+
                "flow: [ ... ]\n"+
                "}\n\n"+        
                "*****************\n"+
                "Run options : The runOptions object can have the following properties which govern the benchmark run:\n"+
                "*****************\n"+
                "*limit - required number of concurrent operations to limit at any given time\n"+
                "*iterations - required number of flow iterations to perform on the main flow (as well as beforeMain and afterMain setup/teardown operations)\n"+
                "*user - optional user to be used for basic authentication\n"+
                "*password - optional password to be used for basic authentication\n"+
                "*prealloc - optional max number of iterations to preallocate before starting, defaults to lesser of 100K and iterations. When using large number of iterations or large payload per iteration, it can be necessary to adjust this for optimal memory use.\n"+
                "\n"+
                "Example:\n"+
                "    runOptions : {\n"+
                "        limit: 10,         // concurrent connections\n"+
                "        iterations: 1000,  // number of iterations to perform\n"+
                "        prealloc: 100      // only preallocate up to 100 before starting\n"+
                "    };\n"+
                "    \n"+
                "*****************\n"+
                "Shortcuts for expressing flow : The runOptions object can have the following properties which govern the benchmark run:\n"+
                "*****************\n"+
                "*   If you have very simple flow that does not need setup and teardown, then there are a few shortcuts for expressing the flow.\n"+
                "*pass flow as just a single REST operation, ex: var flow = { head: 'http://localhost:8000/' };\n"+
                "*pass flow as array of REST operations\n"+
                "    // passing as array implies no setup/teardown and these are the main operations\n"+
                "    flow : [\n"+
                "       { put: 'http://localhost:8000/foo', json: 'mydata' },\n"+
                "       { get: 'http://localhost:8000/foo' }\n"+
                "    ];\n\n"+
                "    Each operation can have the following properties:\n"+
                "       *one of these common REST properties get, head, put, post, patch, del (using del rather than delete since delete is a JS reserved word) with a value pointing to the URI, ex: { get: 'http://localhost:8000/foo' }\n"+
                "       *alternatively can specify method (use uppercase) and uri directly, ex: { method: 'GET', uri: 'http://localhost:8000/foo' }\n"+
                "       *json optionally provide data which will be JSON stringified and provided as body also setting content type to application/json, ex: { put: 'http://localhost:8000/foo', json: { foo: 10 } }\n"+
                "       *headers - optional headers to set, ex: { get: 'http://localhost:8000/foo', headers: { 'Accept-Encoding': 'gzip'}"+
                "---------------------\n"+
                "---------------------\n"+
                " ===>  For any help, contact Joseph Benraz    \n"+
                "---------------------\n"+
                "---------------------\n";
  } else {
    await next();
  }
};

async function benchmark(ctx, next) {
  try {
    if ('/benchmark' == ctx.path) {      
      let bodyObj
      if(typeof(ctx.request.body) == 'string'){
        logger.info('parse request: ' + ctx.request.body);
        bodyObj = JSON.parse(ctx.request.body);
      }else {
        bodyObj =ctx.request.body;
        logger.info('parse request: ' +  JSON.stringify(bodyObj));
      }       
      let val = await bench.runbenchmark(bodyObj.runOptions,bodyObj.flow);
      ctx.body = val;
    } else {
      await next();
    }
  } catch (err) {
    logger.error('parse exception: ' + err.message);    
    ctx.body = { message: err.message };
    ctx.status = err.status || 500;
  }
}
/*let corsOptions = {
  origin: 'http://localhost',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
// enable cors to the server
const corsOpt = {
  origin: process.env.CORS_ALLOW_ORIGIN || '*', // this work well to configure origin url in the server
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'], // to works well with web app, OPTIONS is required
  allowedHeaders: ['Content-Type', 'Authorization'] // allow json and token in the headers
};
app.use(cors(corsOpt)); // cors for all the routes of the application
*/

const all = compose([isAlive, help, benchmark]);
app.use(all)
  .listen(config.service.listen, () => { 
  console.log(`Server start running at Port= ${config.service.listen}`); 
  logger.info(`Server start running at Port= ${config.service.listen}`);    
}); 
