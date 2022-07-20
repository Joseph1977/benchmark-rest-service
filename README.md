Introduction - Benchmark As A Service (load benchmark test-SAAS)
=======================================

This is a Loading Benchmark Service that test REST API and return the benchmark
measurements.
This project built based on "https://github.com/jeffbski/bench-rest"

Getting Started
===============

-   Clone the repository

-   From node.js command, go to repository folder

-   Run “npm i" to install last version of the dependences

-   Run “npm start" to run

API:
====

1.  Help: <http://localhost:3000/help>

    This will return the usage of the service and the format

1.  Benchmark: <http://localhost:3000/benchmark>

    The main API which receive the endpoint and some params (see later), run a
    loading benchmark test, and return an average time

    Output example:
    {"errors": 0 //if any error
    "stats": { 
    "totalElapsed": 894,
    "main": { 
        "meter": { 
        "mean": 1240.6947890818858,
        "count": 1000,
        "currentRate": 1240.6947890818858,
        '1MinuteRate": 0,
        '5MinuteRate": 0,
        "15MinuteRate": 0
        },
        "histogram": { 
        "min": 4,
        "max": 89,
        "sum": 41603,
        "variance": 242.0954864864864,
        "mean": 41.603,
        "stddev": 15.55941793533699,
        "count": 1000,
        "median": 42,
        "p75": 50,
        "p95": 70.94999999999993,
        "p99": 81.99000000000001,
        "p999": 88.99900000000002
        }
    }}}

    A couple key metrics to be aware of:

-   stats.main.meter.mean - average iterations / sec

-   stats.main.meter.count - iterations completed

-   stats.main.meter.currentRate - iterations / sec at this moment (mainly
    useful when monitoring progress)

-   stats.main.1MinuteRate - iterations / sec for the last minute (only relevant
    if more than 1 minute has passed)

-   stats.main.histogram.min - the minimum time any iteration took
    (milliseconds)

-   stats.main.histogram.max - the maximum time any iteration took
    (milliseconds)

-   stats.main.histogram.mean - the average time any iteration took
    (milliseconds)

-   stats.main.histogram.p95 - the amount of time that 95% of all iterations
    completed within (milliseconds)

    InPut:

    \#\#\# Shortcuts for expressing flow

    If you have very simple flow that does not need setup and teardown, then
    there are a few shortcuts for expressing the flow.

-   pass flow as just a string URL - it will perform a GET on this URL as the
    main flow, ex: var flow = 'http://localhost:8000/';

-   pass flow as just a single REST operation, ex: var flow = { head:
    'http://localhost:8000/' };

-   pass flow as array of REST operations

    *// passing as array implies no setup/teardown and these are the main operations*

    var flow **=** [
     { put**:** '*http://localhost:8000/foo*', json**:** 'mydata' },
     { get**:** '*http://localhost:8000/foo*' }
   ];

    \#\#\# Run options

    The runOptions object can have the following properties which govern the
    benchmark run:

-   limit - required number of concurrent operations to limit at any given time

-   iterations - required number of flow iterations to perform on the main flow
    (as well as beforeMain and afterMainsetup/teardown operations)

-   prealloc - optional max number of iterations to preallocate before starting,
    defaults to lesser of 100K and iterations. When using large number of
    iterations or large payload per iteration, it can be necessary to adjust
    this for optimal memory use.

-   user - optional user to be used for basic authentication

-   password - optional password to be used for basic authentication

-   progress - optional, if non-zero number is provided it enables the output of
    progress events each time this number of milliseconds has passed

    \#\#\# REST Operations in the flow

    The REST operations that need to be performed in either as part of the main
    flow or for setup and teardown are configured using the following flow
    properties.

    Each array of opertions will be performed in series one after another unless
    an error is hit. The afterMain and after operations will be performed
    regardless of any errors encountered in the flow.

     var flow **=** {
       before**:** [],      *// REST operations to perform before anything starts*
       beforeMain**:** [],  *// REST operations to perform before each iteration*
       main**:** [],        *// REST operations to perform for each iteration*
       afterMain**:** [],   *// REST operations to perform after each iteration*
       after**:** []        *// REST operations to perform after everything is finished*
     };

    Each operation can have the following properties:

-   one of these common REST properties get, head, put, post, patch, del (using
    del rather than delete since delete is a JS reserved word) with a value
    pointing to the URI, ex: { get: 'http://localhost:8000/foo' }

-   alternatively can specify method (use uppercase) and uri directly, ex: {
    method: 'GET', uri: 'http://localhost:8000/foo' }

-   json optionally provide data which will be JSON stringified and provided as
    body also setting content type to application/json, ex: { put:
    'http://localhost:8000/foo', json: { foo: 10 } }

-   headers - optional headers to set, ex: { get: 'http://localhost:8000/foo',
    headers: { 'Accept-Encoding': 'gzip'}}

-   any other properties/options which are valid for mikeal/request -
    see https://github.com/mikeal/request

-   pre/post processing - optional array as beforeHooks and afterHooks which can
    perform processing before and/or after an operation. See [Pre/post operation
    processing](https://www.npmjs.com/package/bench-rest#pre-post) section below
    for details.

    \#\#\# Token substitution for iteration operations

    To make REST flows that are independent of each other, one often wants
    unique URLs and unique data, so one way to make this easy is to include
    special tokens in the uri, json, or data.

    Currently the token(s) replaced in the uri, json, or body are:

-   \#{INDEX} - replaced with the zero based counter/index of the iteration

    Note: for the json property the json object is JSON.stringified, tokens
    substituted, then JSON.parsed back to an object so that tokens will be
    substituted anywhere in the structure. If subsitution is not needed
    (no \#{INDEX} in the structure, then no copy (stringify/parse) will be
    performed.

-   \#{INDEX.\*\*} – replaced by the corresponding dynamic input value
    The arrays of input data in the: runOptions. dynamicInputArrays.
    The “\*\*” is the index of the dynamic input array (dynamicInputArrays)
    The value taken from the dynamic input array is the Math.MIN(iteration\# ,
    dynamicInputArrays.length-1)

    For example:

| { |
|---|
    "runOptions": {
      "limit": 10,
      "iterations": 10,
      "dynamicInputArrays": [
        [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10000
        ],
        [
          "A",
          "B",
          "C",
          "D",
          "E",
          "F",
          "G",
          "H",
          "I",
          "Y"
        ]
      ]
    },
    "flow": [
      {
        "post":
      "[http://localhost:3001/parse?\#{INDEX.0}](http://localhost:3001/parse?#%7BINDEX.0%7D)",
        "json": {
          "runOptions": {
            "logtype": "TEST--\#{INDEX.0}",
            "data":"ID:\#{INDEX.1} Log Details\\r\\n"
          }
        }
      }
    ]
  }

| \#\#\#\# The \#{INDEX.0} will be replaced by the first array in dynamicInputArrays |
|------------------------------------------------------------------------------------|
| \#\#\#\# The \#{INDEX.1} will be replaced by the second array in dynamicInputArrays|


    The service will receive:
    runOptions: {"logtype":"TEST--1","data":"A Log Details\\r\\n"}
    runOptions: {"logtype":"TEST--2","data":"B Log Details\\r\\n"}
    runOptions: {"logtype":"TEST--3","data":"C Log Details\\r\\n"}
    runOptions: {"logtype":"TEST--4","data":"D Log Details\\r\\n"}
    …..
    runOptions: {"logtype":"TEST--10000","data":"Y Log Details\\r\\n"}
    \#\#\# Pre/post operation processing

    If an array of hooks is specified in an operation
    as beforeHooks and/or afterHooks then these synchronous operations will be
    done before/after the REST operation.

    Built-in processing filters can be referred to by name using a string, while
    custom filters can be provided as a function, ex:

    *// This causes the HEAD operation to use a previously saved etag if found for this URI*
    *// setting the If-None-Match header with it, and then if the HEAD request returns a failing*
    *// status code*

    { head**:** '*http://localhost:8000*', beforeHooks**:** ['useEtag'], afterHooks**:** ['ignoreStatus'] }

    The list of current built-in beforeHooks:

-   useEtag - if an etag had been previously saved for this URI
    with saveEtag afterHook, then set the appropriate header (for
    GET/HEAD, If-None-Match, otherwise If-Match). If was not previously saved or
    empty then no header is set.

    The list of current built-in afterHooks:

-   saveEtag - afterHook which causes an etag to be saved into an object cache
    specific to this iteration. Stored by URI. If the etag was the result of a
    POST operation and a Location header was provided, then the URI at
    the Location will be used.

-   ignoreStatus - afterHookif an operation could possibly return an error code
    that you want to ignore and always continue anyway. Failing status codes are
    those that are greater than or equal to 400. Normal operation would be to
    terminate an iteration if there is a failure status code in
    any before, beforeMain, or main operation.

-   verify2XX - afterHook which fails if an operation's status code was not in
    200-299 range. If you don't want a redirect followed, be sure to add the
    request option followRedirect: false. Note: by default errors are verified
    (greater than or equal to 400), so this would just be used when you want to
    make sure it is not a 3xx either.

-   startStepTimer - used in beforeHooks to start a timer for this step named
    step_OPIDX where OPIDX is the zero based index of the step in the flow. Be
    sure to call endStepTimer in afterHooks to end it. Provides detailed stats
    for an individual step in a flow.

-   endStepTimer - used in afterHooks to end a timer previously started
    with startStepTimer and included in the stats displayed at the end of the
    run.


Joseph Benraz
