#!/usr/bin/env node
const {execSync}=require("child_process");
const {
	readFileSync,
	writeFileSync,
}=require("fs");
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
}))

writeFileSync(
	config_servers,
	JSON.stringify(servers,null,2).split("  ").join("\t"),
);

process.chdir(config.path||".");

function getServerIndex(findTag,getBy){
	let index;

	switch(getBy){
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

if(processArgs.length){ // wenn parameter übergeben
	if(
		processArgs[0]=="set"&&
		processArgs.length>4
	){
		const serverIndex=getServerIndex(
			processArgs[2],
			processArgs[1].substring(2)
		);
		if(processArgs[3]=="running"){
			const running=Boolean(Number(processArgs[4]));
			console.log("set running for "+servers[serverIndex].name+" to "+running)
			if(!servers[serverIndex].info){servers[serverIndex].info={}}
			servers[serverIndex].info.running=running;
		}
	}
}

writeFileSync(
	config_servers,
	JSON.stringify(servers,null,2).split("  ").join("\t"),
);
