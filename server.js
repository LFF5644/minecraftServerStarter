#!/bin/env node
const {readFileSync,writeFile}=require("fs");
const {createServer}=require("http");
const {spawn}=require("child_process");

const [node,thisFile,...processArgs]=process.argv;
let path=thisFile.split("/");
path.pop();
path=path.join("/");

const config_servers=path+"/servers.json";
const config_file=path+"/config.json";
const infoText="\x1b[32mINFO: \x1b[0m";

let servers=JSON.parse(readFileSync(config_servers,"utf-8"));
const config=JSON.parse(readFileSync(config_file,"utf-8"));
const sessionData={};
const players={};
const serverStatus={
	running:false,
	status:"Offline",
	statusColor:"red",
	step:null,
	playersOnline:0,
	players:[],
	lastSave:Date.now(),
	pid:null,
	isSleeping:false,
};

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
		default:
			console.log("cant get server by "+getBy);
	}
	if(index==-1){
		console.log("server not found!");
	}
	return index;
}
function BEEP(){	// let MY pc beep if do not work try "sudo chmod 777 /dev/console"
	try{
		writeFile("/dev/console","\007","utf-8",function(){});
	}catch(e){}
}

servers=servers.map(item=>({
	...config.template_server,
	...item,
}));

process.chdir(path);
process.chdir(config.path);

if(processArgs.length<2){
	console.log("Es Fehlen Infomaitonen!");
	process.exit(1);
}

const server=servers[getServerIndex(
	processArgs[1],
	processArgs[0].substring(2),
)];

console.log(server);
if(!server){
	process.exit(1);
}

process.chdir(server.folder);
const minecraftServerProcess=spawn(server.javaPath=="java"?"/usr/bin/java":server.javaPath,[
	"-Xmx"+(server.ram?server.ram:"256M"),
	"-jar",
	server.serverJar,
]);
process.stdin.on("data",buffer=>{
	const text=buffer.toString("utf-8");	// buffer => text
	let msg=text.split("\n").join("");

	if(
		msg.startsWith("/")||
		msg.startsWith("$")||
		msg.startsWith(">")
	){
		msg=msg.substring(1).trim();
	}else{
		msg="say "+msg;
	}
	if(server.serverType!="proxy/bungee") minecraftServerProcess.stdin.write(msg+"\n");
});
minecraftServerProcess.on("exit",code=>{
	console.log("");
	console.log(code?"Minecraft-Server CRASHED: "+code:"Minecraft-Server Exited!");

	serverStatus.running=false;
	serverStatus.status=code?"CRASHED!":"Offline";
	serverStatus.statusColor=code?"red":null;
	if(!code) serverStatus.lastSave=Date.now();
	serverStatus.playersOnline=0;
	serverStatus.players=[];
	serverStatus.pid=null;

	setTimeout(console.log,5e3,"Exit in 3s ....");
	setTimeout(process.exit,7e3,0);
});
minecraftServerProcess.stdout.on("data",buffer=>{
	const text=buffer.toString("utf-8");	// buffer => text
	let msg=(text
		.split("\n").join("")
		.split("\r").join("")
	);
	if(msg.endsWith(">")){
		msg=msg.substring(0,msg.length-1);
	}
	if(msg){
		console.log("RAW: "+msg);
	}
	
	if(server.serverType=="mcs/paper"){
		if(	// "[15:12:27 INFO]: Server Started" => "Server Started"
			msg.startsWith("[")&&
			msg.includes(":")&&
			msg.substring(3,7).startsWith(":")&&
			msg.substring(3,7).endsWith(":")&&
			(
				msg.substring(10,14)=="WARN"||
				msg.substring(10,14)=="INFO"
			)&&
			msg.substring(14,17)=="]: "
		){
			msg=msg.substring(17);
		}
		if(!serverStatus.running){
			if(msg.startsWith("Preparing spawn area: ")){
				serverStatus.step="Welt wird geladen "+msg.substring("Preparing spawn area: ".length);
				serverStatus.status="Startet ...";
			}
			else if(
				msg.startsWith("Done (")||
				msg.startsWith("Done(")
			){
				serverStatus.running=true;
				serverStatus.step=null;
				serverStatus.status="Online";
				serverStatus.statusColor="green";
				console.log(infoText+"Minecraft Server is running!");
			}
			else if(msg=="Closing Server"){
				serverStatus.status="Offline";
				serverStatus.statusColor="red";
				console.log(infoText+"Minecraft Server is offline!");
			}
		}
		else if(serverStatus.running){
			if(
				msg=="Stopping the server"||
				msg=="Stopping server"
			){
				serverStatus.running=false;
				serverStatus.status="Herunterfahren ...";
				serverStatus.statusColor="orange";
			}
			else if(	// UUID of player LFF5644 is xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx
				msg.startsWith("UUID of player ")
			){
				const textLength="UUID of player".length;
				const playerName=msg.substring(
					textLength+1,
					msg
						.split("")
						.findIndex((item,index)=>
							index>textLength&&
							item==" "
						)
				);
				if(Object.keys(players).includes(playerName)){
					// TODO => player[playerName].uuid=playerUUID
				}else{
					players[playerName]={
						// TODO => ...playerTemplate,
						name:playerName,
						online:true,
					};
				}
			}
			else if(	// LFF5644[/127.0.0.1:59071] logged in with entity id 60397 at ([world]x, y, z)
				msg.includes(" logged in with entity id ")
			){
				const playerName=msg.substring(0,msg
					.split("")
					.findIndex(item=>item=="[")
				);
				if(Object.keys(players).includes(playerName)){
					players[playerName].online=true;
					serverStatus.playersOnline+=1;
					if(!serverStatus.players.includes(playerName)) serverStatus.players.push(playerName);
					console.log(infoText+playerName+" Betritt das Spiel ("+serverStatus.playersOnline+" Spieler Online)");
					BEEP();
				}else{
					console.log("WARNUNG: player "+playerName+" not found!");
				}
			}
			else if(	// LFF5644 lost connection: Disconnected
				msg.includes(" lost connection: ")
			){
				const playerName=msg.substring(0,msg
					.split("")
					.findIndex(item=>item==" ")
				);
				if(Object.keys(players).includes(playerName)){
					players[playerName].online=false;
					serverStatus.playersOnline-=1;
					if(serverStatus.players.includes(playerName)){
						serverStatus.players.splice(
							serverStatus.players
								.findIndex(item=>
									item==playerName
								)
							,1
						);
					}
					console.log(infoText+playerName+" Verlässt das Spiel ("+serverStatus.playersOnline+" Spieler Online)");
					BEEP();
					setTimeout(BEEP,2e2);
				}else{
					console.log(infoText+"WARNUNG: player "+playerName+" not found!");
				}
			}
		}
	}
	else if(server.serverType=="proxy/bungee"){
		if(	// "21:23:50 [INFORMATION] Server Started" => "Server Started"
			msg.substring(2,3)==":"&&
			msg.substring(5,6)==":"&&
			msg.substring(8,10)==" ["&&
			(
				msg.substring(21,23)=="] "||
				msg.substring(17,19)=="] "
			)
		){
			if(msg.substring(10,21)=="INFORMATION"){
				msg=msg.substring(23);
			}
			else if(msg.substring(10,17)=="WARNUNG"){
				msg=msg.substring(19);
			}
		}

		if(!serverStatus.running){	// if server not running
			if(msg.startsWith("Listening on ")){
				serverStatus.running=true;
				serverStatus.step=false;
				console.log(infoText+"Server is running");
			}
			
		}
		else if(serverStatus.running){	// if server running

		}
	}
});
const httpServer=createServer((request,response)=>{
	let [path,args]=request.url.split("?");

	response.writeHead(200,{
		"Content-Type": "text/plain; charset=utf-8",
		"Cache-Control": "no-cache, no-store",
	});

	if(path.startsWith("/get")){
		if(path=="/get/serverStatus"){
			response.write(
				JSON.stringify(
					serverStatus,null,2
				)
				.split("  ")
				.join("\t")
			);
		}
	}
	else if(path.startsWith("/set")){
		if(path=="/set/serverSleeping"){
			const requireSleep=Number(args);
			
			if(requireSleep){
				if(serverStatus.isSleeping){
					response.write("Server is already sleeping!");
				}else{
					process.kill(serverStatus.pid,"SIGSTOP");
					response.write("Server is now sleeping ...");
					serverStatus.isSleeping=true;
				}
			}
			if(!requireSleep){
				if(serverStatus.isSleeping){
					process.kill(serverStatus.pid,"SIGCONT");	// is not work for more then 20s
					response.write("Wake up server ....");
					serverStatus.isSleeping=false;
				}else{
					response.write("Server is already awake!");
				}
			}
		}
	}
	response.end();

});
httpServer.listen(server.httpPort);

console.log("Minecraft-Server is running on PID "+minecraftServerProcess.pid);
console.log("HTTP-Server is Running on port "+server.httpPort);
serverStatus.pid=minecraftServerProcess.pid;
