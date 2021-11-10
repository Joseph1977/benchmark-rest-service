Building your docker image
--------------------------

Go to the directory that has your Dockerfile and run the following command to
build the Docker image. The -t flag lets you tag your image so it's easier to
find later using the docker images command:

\$ **docker build -t \<your username\>/node-loading-benchmark .**

Your image will now be listed by Docker:

\$ **docker images**

\# Example

REPOSITORY TAG ID CREATED

node 8 1934b0b038d1 5 days ago

\<your username\>/node-web-app latest d64d3505b0d2 1 minute ago

Run the image
-------------

Running your image with -d runs the csontainer in detached mode, leaving the
container running in the background. The -p flag redirects a public port to a
private port inside the container. Run the image you previously built:

>   **docker run -p 8080:3000 -d
>   packagemanager.xxxxx.com/private-docker/node-loading-benchmark**

sTest
-----

To test your app, get the port of your app that Docker mapped:

**docker run -p8080:3000 josephbenraz/node-loading-benchmark**

\> benchmark-rest-service\@1.0.0 start /app

\> node server.js

**If I call the /benchmark api, an output will be displayed:**

<http://localhost:8080/benchmark>

parameters:

{

"runOptions": {

"limit": 500,

"iterations": 2000

},

"flow": [{

"get": "http://accountservice.domain.com/api/v1/accounts/4366181847820013"

}]

}

**In server ill see:**

Bencmark startes with:

runOptions: {"limit":500,"iterations":2000}

flow:
[{"get":"http://accountservice.domain.com/api/v1/accounts/4366181847820013"}]

error count: 0

stats { totalElapsed: 2801.1128000002354,

main:

{ meter:

{ mean: 716.4043265663333,

count: 2000,

currentRate: 716.4040186254153,

'1MinuteRate': 0,

'5MinuteRate': 0,

'15MinuteRate': 0 },

histogram:

{ min: 85.68399999989197,

max: 2123.0544000002556,

sum: 1264736.068200001,

variance: 277931.67983883794,

mean: 632.3680341000005,

stddev: 527.1922607918651,

count: 2000,

median: 300.87099999981,

p75: 1161.5631500001764,

p95: 1663.7798049999633,

p99: 1902.8683669999941,

p999: 2119.7890783002554 } } }

\------------------------------------------------------

docker ps

CONTAINER ID IMAGE COMMAND CREATED STATUS PORTS NAMES

4b4ea02132ed josephbenraz/node-loading-benchmark "npm start" About a minute ago
Up 59 seconds 0.0.0.0:8080-\>3000/tcp unruffled_newton
