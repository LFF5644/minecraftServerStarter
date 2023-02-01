#!/usr/bin/env node
const {execSync}=require("child_process");
const {
	readFileSync,
	writeFileSync,
}=require("fs");

let path=process.argv[1].split("/");
path.pop();
path=path.join("/");

const config_servers=path+"/servers.json";
const config_file=path+"/config.json";

let servers=JSON.parse(readFileSync(config_servers,"utf-8"));
const config=JSON.parse(readFileSync(config_file,"utf-8"));

servers=servers.map(server=>({
	...config.template_server,
	...server,
}))

writeFileSync(
	config_servers,
	JSON.stringify(servers,null,2).split("  ").join("\t"),
	"utf-8"
);

process.chdir(config.path||".");

let server;
for(server of servers){
	if(server.startType!="auto"){continue;}
	if(server.info.running){continue;}
	const filename="server"+String(Math.random()).substring(2,8)+".sh";
	const file=(`
		cd "${path}";
		./serverStatus.js set --name "${server.name}" running 1;

		cd "${config.path||"."}";
		cd "${server.folder}";
		${server.javaPath}${server.ram?" -Xmx"+server.ram:""} -jar "${server.serverJar}";
		
		cd "${path}";
		./serverStatus.js set --name "${server.name}" running 0;
		rm cache/${filename};
	`
		.split("\n").join("")
		.split("\t").join("")
	);
	writeFileSync(path+"/cache/"+filename,file,"utf-8");
	const cmd=(`
		screen -dmS ${server.screenName?server.screenName:server.folder} 
		sh ${path}/cache/${filename}
	`
		.split("\n").join("")
		.split("\t").join("")
	);
	console.log(server.name+" => is starting...");
	execSync(cmd);
}
