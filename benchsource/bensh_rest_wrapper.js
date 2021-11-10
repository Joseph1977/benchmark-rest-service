
"use strict"

var benchrest = require('./bench-rest');

//started the benchmark
class Benchmark {    
    async runbenchmark(runOptions, flow) {
        console.log( "Bencmark startes with: \n" +
        "runOptions: " + JSON.stringify(runOptions) + "\n"+
        "flow: " + JSON.stringify(flow) + "\n");
        var lasterror = "";
        return await new Promise((resolve,reject) => {
            //start the bench-rest stuff
            benchrest(flow, runOptions)
            .on('error', function (err, ctxName) { 
                console.error('Failed in %s with err: ', ctxName, err); 
                lasterror = 'Failed in '+ctxName+' with err: '+ err;
                // we need to wait for the 'end', so we can't reject reject(err);
            })
            .on('end', function (stats, errorCount) {
                console.log('error count: ', errorCount);
                console.log('stats', stats);

                const resultObj = {};
                if(errorCount>=runOptions.iterations){
                    Object.assign(resultObj, {
                        errorCount: errorCount,
                        lasterror: "All iterations faild  --> lastErr:" + lasterror,
                        stats: stats
                    });
                }else{
                    Object.assign(resultObj, {                        
                        errorCount: errorCount,
                        lasterror: lasterror,
                        stats: stats
                    });
                }
                resolve(resultObj);
            });
        });

    };
}
module.exports = Benchmark