#!/usr/bin/env node
const {execSync}=require("child_process");
const {readFileSync}=require("fs");

const config_servers="servers.json";
const config_file="config.json";

const servers=JSON.parse(readFileSync(config_servers,"utf-8"));
const config=JSON.parse(readFileSync(config_file,"utf-8"));

process.chdir(config.path||".");

let server;
for(server of servers){
	server={
		...config.template_server,
		...server,
	};
	if(!server.run){continue;}
	let cmd=`
		cd "${server.folder}";
		screen -dmS ${server.screenName?server.screenName:server.folder} 
		${server.javaPath}${server.ram?" -Xmx"+server.ram:""} -jar "${server.serverJar}"
	`
		.split("\n").join("")
		.split("\t").join("")
		.split(`"`) .join(`"`);
	//console.log(cmd);
	console.log(server.folder+" => is starting...");
	execSync(cmd);
}
