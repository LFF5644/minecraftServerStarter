#!/usr/bin/env node
const {execSync}=require("child_process");
const {readFileSync}=require("fs");

function startServer({
	server,
	startBy="auto",
}){
	if(server.startType=="user"&&startBy=="auto"){return false;}

	process.chdir(config.path||".");
	process.chdir(server.folder);

	let serverStatus={needStart:true};

	try{
		serverStatus=JSON.parse(readFileSync("serverStatus.json","utf-8"));
	}catch(e){}

	if(!serverStatus.needStart){return false;}

	const cmd=(`
		screen -dmS ${server.screenName?server.screenName:server.folder} 
		${path}/server.js ${server.id?`--id "${server.id}"`:`--folder "${server.folder}"`}
	`
		.split("\n").join("")
		.split("\t").join("")
	);
	console.log(server.name+" => is starting...");
	execSync(cmd);
	return true;
}
function getServerIndex(findTag,getBy){
	let index;

	switch(getBy){
		case "id":
			index=servers.findIndex(server=>server.id===findTag);
			break;
		case "name":
			index=servers.findIndex(server=>server.name===findTag);
			break;
		case "folder":
			index=servers.findIndex(server=>server.folder===findTag);
			break;
		case "screenName":
			index=servers.findIndex(server=>server.screenName===findTag);
			break;
	}
	if(index==-1){
		console.log("server not found!");
	}
	return index;
}

const [
	_node,
	_file,
	...processArgs
]=process.argv;

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
}));

if(processArgs.length==0){
	let server;
	let serversStarted=0;
	for(server of servers){
		serversStarted+=Number(startServer({
			server,
			startBy:"auto",
			startAlways:false,
		}));
	}

	console.log(`\n${serversStarted}/${servers.length} Server wurden gestartet`);
}
else if(processArgs[0]=="start"){
	const server=servers[getServerIndex(
		processArgs[2],
		processArgs[1].substring(2)
	)];
	if(!server){
		process.exit(1);
	}
	const started=startServer({
		server,
		startBy:"user",
	});
	if(!started){
		console.log("Server nicht Gestartet!");
	}
}
