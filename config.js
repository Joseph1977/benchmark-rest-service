let config = {};

config.service = {};

//app.use().listen = 
if(process.env.PORT){
    config.service.listen = process.env.PORT; //The default PORT IIS listen to
}else{
    config.service.listen = 3100; //define the default PORT to run incase no process.env file exists and/or PORT not defined
}

///The hostname seems to be the short container id in Docker v1.12
/// make sure your version on nodejs V.6
config.service.logfilepath = process.env.LOG_PATH+"\\"+process.env.APPLICATION_NAME +"\\";

module.exports = config;