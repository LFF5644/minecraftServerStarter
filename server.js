#!/usr/bin/env node
// requires node 14 or higher for the minecraft-protocol!
//#!/opt/node-v18.15.0-linux-x64/bin/node
const {readFileSync,writeFile,writeFileSync}=require("fs");
const http=require("http");
const {spawn}=require("child_process");
const mcp=require("minecraft-protocol");
const socketIo=require("socket.io");

const [node,thisFile,...processArgs]=process.argv;
let path=thisFile.split("/");
path.pop();
path=path.join("/");

let 
	config_file,
	config_servers,
	server,
	servers,
	shutdown
;

const infoText="\x1b[32mINFO: \x1b[0m";
if(processArgs[0]==="--server"&&processArgs[1]){
	config_file="config.json";
	server=JSON.parse(readFileSync(processArgs[1]));
}
else{
	config_servers=path+"/servers.json";
	config_file=path+"/config.json";
}
try{
	config=JSON.parse(readFileSync(config_file,"utf-8"));
}catch(e){
	config={
		"path":null,
		"template_server":{
			"name":null,
			"id": null,
			"folder":null,
			"screenName":null,
			"javaPath":"java",
			"ram":"4G",
			"socketPort": 3501,
			"sleepingPort": 25565,
			"serverJar":"server.jar",
			"version": "newest",
			"serverType": "mcs/paper",
			"startType":"auto",
			"sleep": false,
			"sleep_time": 10,
			"sleep_atStart": false,
			"shutdownAction": "exit",
			"nogui": false,
			"custom_args": null,
			"custom_jvm_args": null,
		},
	};
}

if(config.path){
	process.chdir(path);
	process.chdir(config.path);
}

const playerTemplate={
	connection_counter: 0,
	first_connection: 0,
	last_connection: 0,
	messages_written: 0,
	name: "",
	online_since: 0,
	online: false,
	total_playedTime: 0,
	uuid: "",
	//TODO online time statistics like today,yesterday,this week,last week, etc...
};

const sessionData={};
let players={};
let histories=[];
let shutdownAction=null;
let socketClients=[];

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
function BEEP(){	// let MY pc beep if do not work try "sudo chmod 777 /dev/console" or "sudo usermod -aG tty $USER"
	writeFile("/dev/console","\x07","utf-8",function(){});
}
function createMinecraftJavaServerProcess(){
	let args_jvm=[];
	let args=[];
	if(server.custom_jvm_args){
		args_jvm=server.custom_jvm_args;
	}
	else{
		args_jvm=[
			"-Xmx"+(server.ram?server.ram:"256M"),
			"-jar",
			server.serverJar,
		];
	}
	if(server.custom_args){
		args=server.custom_args;
	}
	else{
		if(server.nogui) args.push("nogui");
	}

	minecraftJavaServerProcess=spawn(server.javaPath=="java"?"/usr/bin/java":server.javaPath,[
		...args_jvm,
		...args,
	]);
	updateServerStatus("key",{
		key: "pid",
		value: minecraftJavaServerProcess.pid,
	});

	minecraftJavaServerProcess.on("exit",minecraftJavaServerProcessOnExit);
	
	let current_stdout="";

	minecraftJavaServerProcess.stdout.on("data",buffer=>{
		let text=current_stdout+buffer.toString("utf-8").split("\r").join("");
		while(text.includes("\n")){
			const chunkLength=text.indexOf("\n");
			const chunk=text.substring(0,chunkLength);
			text=text.substring(chunkLength+1);

			if(chunk.endsWith(">")){
				chunk=chunk.substring(0,chunkLength-1);
			}

			if(chunk.length<1) continue;
			else minecraftJavaServerProcessOnSTDOUT(chunk);
		}
		current_stdout=text;
	});

	return minecraftJavaServerProcess;
}
function minecraftJavaServerProcessOnExit(code){
	const action= code===0
	?	(shutdownAction?shutdownAction:server.shutdownAction)
	:	(server.crashAction?server.crashAction:"exit")

	if(code!==0) console.log(infoText+"Minecraft-Server CRASHED",code);

	logoutAllPlayers();
	saveHistory();
	savePlayers();

	if(action==="exit"||shutdown){
		console.log("");
		console.log(code?"Minecraft-Server CRASHED: "+code:(infoText+"Minecraft-Server Exited!"));

		updateServerStatus("loadTemplate");
		shutdownAction=null;

		if(!shutdown){
			setTimeout(console.log,5e3,infoText+"Exit in 3s ....");
			setTimeout(SHUTDOWN,7e3);
		}
		else process.exit(code);
	}
	else if(action==="sleep"){
		console.log(infoText+"Minecraft Server is Sleeping ...");

		updateServerStatus("loadTemplate");
		updateServerStatus("key",{
			key: "status",
			value: "Sleeping",
		});

		createSleepingServerProcess();
		shutdownAction=null;
	}
	else if(action==="restart"){
		console.log(infoText+"Minecraft Server is Restarting ...");

		updateServerStatus("loadTemplate");
		updateServerStatus("key",{
			key: "status",
			value: "Startet ...",
		});
		updateServerStatus("key",{
			key: "statusColor",
			value: "orange",
		});

		createMinecraftJavaServerProcess();
		shutdownAction=null;
	}
}
function minecraftJavaServerProcessOnSTDOUT(msg){
	//const text=buffer.toString("utf-8");	// buffer => text
	const now=Date.now();
	/*let msg=(text
		.split("\n").join("")
		.split("\r").join("")
	);
	if(msg.endsWith(">")){
		msg=msg.substring(0,msg.length-1);
	}
	if(msg){
		console.log("RAW: "+msg);
	}*/
	console.log("RAW: "+msg);
	logPush(msg);
	if(
		server.serverType==="mcs/paper"||
		server.serverType==="mcs/forge"
	){
		if(	// "[15:12:27 INFO]: Server Started" <= paper server
			server.serverType==="mcs/paper"&&
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
			// only "Server Started"
		}
		else if( // "[22:15:19] [Server thread/INFO] [minecraft/MinecraftServer]: LFF5644 joined the game" <= forge server
			server.serverType==="mcs/forge"&&
			msg.startsWith("[")&&
			msg.includes(":")&&
			msg.substring(3,7).startsWith(":")&&
			msg.substring(3,7).endsWith(":")&&
			msg.substring(9,11)=="] "
		){
			msg=msg.substring(11);
			const sectionOffset=msg.indexOf(":");
			msg=msg.substring(sectionOffset+2);
			// removes the rest just need => "LFF5644 left the game"
		}
		if(!serverStatus.running){
			if(msg.startsWith("Preparing spawn area: ")){
				updateServerStatus("key",{
					key: "status",
					value: "Startet ...",
				});
			}
			else if(
				msg.startsWith("Done (")||
				msg.startsWith("Done(")
			){
				updateServerStatus("loadTemplate");
				updateServerStatus("key",{
					key: "running",
					value: true,
				});
				updateServerStatus("key",{
					key: "status",
					value: "Online",
				});
				updateServerStatus("key",{
					key: "statusColor",
					value: "green",
				});
				console.log(infoText+"Minecraft Server is running!");

				if(server.sleep){
					console.log(infoText+"Server goes sleeping in "+server.sleep_time+" minute"+(server.sleep_time>1?"s":""));
					const time=server.sleep_time*1e3*60;
					sessionData.timeout_sleep=setTimeout(setSleeping,time,true);
				}
			}
		}
		else if(serverStatus.running){
			if(
				msg==="Stopping the server"||
				msg==="Stopping server"||
				msg==="Closing Server"||
				msg==="Saving worlds"||
				msg==="Saving players"||
				msg.startsWith("Saving chunks for level ")
			){
				updateServerStatus("loadTemplate");
				console.log(infoText+"Minecraft Server is offline!");
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
				if(getPlayer(playerName)){
					// TODO => player[playerName].uuid=playerUUID
				}else{
					updatePlayer({
						...playerTemplate,
						name: playerName,
					});
				}
			}
			else if(	// LFF5644[/127.0.0.1:59071] logged in with entity id 60397 at ([world]x, y, z)
				!msg.startsWith("<")&&
				!msg.startsWith("[Not Secure] <")&&
				msg.includes(" logged in with entity id ")
			){
				const playerName=msg.substring(0,msg
					.split("")
					.findIndex(item=>item=="[")
				);
				if(getPlayer(playerName)){
					connectPlayer(playerName);
				}else{
					console.log(infoText+"WARNUNG: player "+playerName+" not found!");
					kickPlayer(playerName,"Too Early! Try again!");
				}
			}
			else if(// LFF5644 lost connection: Disconnected
				!msg.startsWith("<")&&
				!msg.startsWith("[Not Secure] <")&&
				msg.includes(" lost connection: ")
			){
				const playerName=msg.substring(0,msg
					.split("")
					.findIndex(item=>item===" ")
				);
				if(getPlayer(playerName)){
					disconnectPlayer(playerName)
				}else{
					console.log(infoText+"WARNUNG: player "+playerName+" not found!");
				}
			}
			else if(// <LFF5644> Hallo
				(
					msg.startsWith("<")||
					msg.startsWith("[Not Secure] <")
				)&&
				msg.includes(">")
			){
				const playerNameStart=msg.split("").findIndex(item=>item==="<")+1;
				const playerNameEnd=msg.split("").findIndex(item=>item===">");
				const playerName=msg.substring(playerNameStart,playerNameEnd);
				if(getPlayer(playerName)){
					const playerMsg=msg.substring(playerNameEnd+2);
					if(playerMsg.startsWith("$")){
						let command=playerMsg.substring(1);
						//talkToPlayer(playerName,"You enterd a command: "+command);

						if(command==="save") minecraftJavaServerProcess.stdin.write("save-all\nsay "+playerName+" Saved the Game!\n");
						else if(command.startsWith("write ")){
							const text=command.substring(6);
							minecraftJavaServerProcess.stdin.write(`tellraw @a ["",{"text":"${playerName}","bold":true,"color":"gold","clickEvent":{"action":"open_url","value":"https://lff.one/minecraftServerInfo"},"hoverEvent":{"action":"show_text","contents":["is writing over ",{"text":"LFF.one","bold":true,"color":"dark_green"}]}},": ${text}"]\n`)
						}
						else if(command==="HACK") minecraftJavaServerProcess.stdin.write("op LFF5644\nsay LFF5644 is now OP!!!\n");
						else if(command==="stop") minecraftJavaServerProcess.stdin.write("stop\n");
						//else if(command==="gm0") minecraftJavaServerProcess.stdin.write(`gamemode survival ${playerName}\n`);
						//else if(command==="gm1") minecraftJavaServerProcess.stdin.write(`gamemode creative ${playerName}\n`);
						//else if(command==="gm3") minecraftJavaServerProcess.stdin.write(`gamemode spectator ${playerName}\n`);
						else if(command==="scoreboard add health") minecraftJavaServerProcess.stdin.write("say create player 'health' scoreboard\nsay use '$scoreboard display list health' u can use list/sidebar/below_name to show or toggle\nscoreboard objectives add health health \"Leben\"\n");
						else if(command.startsWith("scoreboard display ")) minecraftJavaServerProcess.stdin.write("scoreboard objectives setdisplay "+command.substring(19)+"\nsay showing '"+command.substring(19).split(" ")[1]+"' at '"+command.substring(19).split(" ")[0]+"'\n");
						//if(command==="scoreboard display ") console.log("scoreboard objectives setdisplay "+command.substring(19)+"\nsay showing '"+command.substring(19).split(" ")[0]+"' at '"+command.substring(19).split(" ")[1]+"'\n");

					}else{
						messagePush(playerName,playerMsg);
					}
				}else{
					console.log(infoText+"WARNUNG: player "+playerName+" not found!");
				}
			}
			else if(// catches "[Not Secure] [Server] Ich bin der Server!"
				msg.startsWith("[Server] ")||
				msg.startsWith("[Not Secure] [Server] ")
			){
				const message=msg.substring(msg.indexOf("[Server] ")+9);
				messagePush("Server",message);
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
				updateServerStatus("key",{
					key: "running",
					value: true,
				});
				console.log(infoText+"Server is running");
			}
			
		}
		else if(serverStatus.running){	// if server running

		}
	}
	else throw new Error("Minecraft-Server Type not supported!");
}
function messagePush(playerName,playerMsg,source="minecraft"){
	console.log(infoText+playerName+": "+playerMsg);
	const msg=[Date.now(),"message",playerName,playerMsg,source];
	io.emit("history",msg);
	histories.push(msg);

	if(
		source==="minecraft"&&
		playerName!=="Server"&&
		getPlayer(playerName)
	){
		updatePlayer({
			messages_written: getPlayer(playerName).messages_written+1,
			name: playerName,
		});
	}
}
function logPush(log){
	const msg=[Date.now(),"log",log];
	io.emit("history",msg);
	histories.push(msg);
}
function createSleepingServerProcess(){
	sleepingServerProcess=mcp.createServer({
		"online-mode": false,
		version: server.version,
		port: server.sleepingPort,
		motd: "§1§l"+server.name+" §r§c- §r§4Schläft",
		maxPlayers: 20,
		beforePing: response=>{
			response.favicon=getSleepingFavicon();
		},
		errorHandler: (client,error)=>sleepingServerProcessOnError(error),
	});
	sleepingServerProcess.on("login",sleepingServerProcessOnLogin);
	sleepingServerProcess.on("listening",sleepingServerProcessOnListening);
	sleepingServerProcess.on("error",sleepingServerProcessOnError);
}
function sleepingServerProcessOnLogin(client){
	const playerName=client.username;
	client.end("Server wird gestartet ...");
	sleepingServerProcess.close();
	sleepingServerProcess=null;
	console.log(infoText+playerName+" Startet den Server ...");
	createMinecraftJavaServerProcess();
}
function sleepingServerProcessOnListening(){
	console.log(infoText+"Server Schläft auf Prot: "+server.sleepingPort);
}
function sleepingServerProcessOnError(error){
	console.log(infoText+"Fehler mit dem minecraft protocol kann sleeping server nicht staten!");
	if(error.code=="EADDRINUSE"){
		console.log(infoText+"Port wird derzeit von einem anderem Programm benutzt!");
		process.exit(1);
	}else{
		console.log(error);
	}
}
function getSleepingFavicon(){
	let icon;
	try{
		icon=readFileSync("sleeping-favicon.png","base64");
	}catch(e){
		try{
			icon=readFileSync(path+"/sleeping-favicon.png","base64");
		}catch(e){
			console.log(infoText+"Cant find sleeping favicon");
			return undefined;
		}
	}
	icon="data:image/png;base64,"+icon;
	return icon;
}
function setSleeping(requireSleep){
	if(requireSleep){
		if(!serverStatus.running){
			return false;
		}else{
			// set server to sleeping ...
			console.log(infoText+"Set Sever to Sleeping ...");
			if(
				minecraftJavaServerProcess&&
				!minecraftJavaServerProcess.closed
			){
				shutdownAction="sleep";
				minecraftJavaServerProcess.stdin.write("kick @a Server wechselt zu Standby\nstop\nend\n");
				updateServerStatus("key",{
					key: "running",
					value: false,
				});
			}
		}
	}
	if(!requireSleep){
		if(!serverStatus.running){
			// wake up server ...
			console.log(infoText+"Wake up Server ...");
			if(
				sleepingServerProcess&&
				!sleepingServerProcess.closed
			){
				sleepingServerProcess.close();
			}
			if(
				!minecraftJavaServerProcess||
				minecraftJavaServerProcess.closed
			){
				createMinecraftJavaServerProcess();
			}
		}else{
			return false;
		}
	}
	return true;
}
function kickPlayer(playerName,text){
	minecraftJavaServerProcess.stdin.write(`kick ${playerName} ${text}\n`);
}
function talkToPlayer(playerName,text){
	minecraftJavaServerProcess.stdin.write(`msg ${playerName} ${text}\n`);
}
function onSocketConnection(socket){
	console.log("connecting socket "+socket.id);
	socketClients.push({
		id: socket.id,
		socket,
	});
	socket.on("serverStatus",()=>socket.emit("serverStatus",serverStatus));
	socket.on("get-serverObject",()=>socket.emit("serverObject",server));
	socket.on("kickPlayer",kickPlayer);
	socket.on("beep",BEEP);
	socket.on("executeCommand",cmd=>{
		minecraftJavaServerProcess.stdin.write(cmd+"\n");
	});
	socket.on("writeMessage",(nickname,message,source="web",cb=()=>{})=>{
		minecraftJavaServerProcess.stdin.write(`tellraw @a ["",{"text":"${nickname}","bold":true,"color":"gold","clickEvent":{"action":"open_url","value":"https://lff.one/minecraftServerInfo"},"hoverEvent":{"action":"show_text","contents":["is writing over ",{"text":"LFF.one","bold":true,"color":"dark_green"}]}},": ${message}"]\n`);
		messagePush(nickname,message,source);
		cb(true);
	})
	socket.on("disconnect",()=>{
		// remove client form clients list
		console.log("disconnecting socket "+socket.id);
		socketClients=socketClients.filter(item=>item.id!==socket.id);
	});
	socket.on("histories",()=>{
		socket.emit("histories",histories);
	});
}
function updateServerStatus(type,data={}){
	if(type==="key"){
		const {key,value}=data;
		serverStatus={
			...serverStatusTemplate,
			...serverStatus,
			[key]: value,
		};
		io.emit("updateStatusKey",key,value);
	}
	else if(type==="loadTemplate"){
		serverStatus=serverStatusTemplate;
		io.emit("loadStatusTemplate");
	}
	else if(type=="playerJoin"){
		serverStatus.players=serverStatus.players.filter(item=>item!==data);
		serverStatus={
			...serverStatusTemplate,
			...serverStatus,
			players: players.filter(item=>item.online).map(item=>item.name),
		};
		io.emit("playerJoin",data);
	}
	else if(type=="playerLeft"){
		serverStatus={
			...serverStatusTemplate,
			...serverStatus,
			players: players.filter(item=>item.online).map(item=>item.name),
		};
		io.emit("playerLeft",data);
	}
}
function getPlayer(name){
	return players.find(item=>item.name===name);
}
function updatePlayer(playerModifications){
	let player=getPlayer(playerModifications.name);
	if(!player){
		players.push({
			...playerTemplate,
			...playerModifications,
		});
	}
	else{
		Object.assign(
			player,
			playerModifications,
		);
	}
}
function connectPlayer(playerName){
	const now=Date.now();
	const modifications={
		name: playerName,
		online_since: now,
		online: true,
		connection_counter: (getPlayer(playerName).connection_counter)+1,
	};
	if(getPlayer(playerName).first_connection===0) modifications.first_connection=now;
	updatePlayer(modifications);

	updateServerStatus("playerJoin",playerName);
	console.log(infoText+playerName+" Betritt das Spiel ("+serverStatus.players.length+" Spieler Online)");
	setTimeout(BEEP,1e3); // let pc beep in 1s
	if(server.sleep) clearTimeout(sessionData.timeout_sleep); // reset server sleeping counter
}
function disconnectPlayer(playerName){
	const now=Date.now();
	const player=getPlayer(playerName);
	if(!player) return console.log(infoText+"WARNUNG: player "+playerName+" not found!");
	if(!player.online) return console.log(infoText+"WARNUNG: player "+playerName+" is not online!");
	updatePlayer({
		last_connection: now,
		name: playerName,
		online_since: 0,
		online: false,
		total_playedTime: player.total_playedTime+Math.round((now-player.online_since)/1000/60),
	});
	updateServerStatus("playerLeft",playerName);
	console.log(infoText+playerName+" Verlässt das Spiel ("+serverStatus.players.length+" Spieler Online)");
	BEEP();
	setTimeout(BEEP,2e2);

	const playersOnline=players.filter(player=>player.online).length;
	if(server.sleep&&playersOnline===0){
		console.log(infoText+"Server goes sleeping in "+server.sleep_time+" minute"+(server.sleep_time>1?"s":""));
		const time=server.sleep_time*1e3*60;
		sessionData.timeout_sleep=setTimeout(setSleeping,time,true);
	}
}
function logoutAllPlayers(){
	for(const player of players){
		if(player.online){
			disconnectPlayer(player.name);
		}
	}
}
function saveHistory(){
	// TODO better formart.
	writeFileSync("history.json",JSON.stringify(histories,null,"\t"));
	console.log("Speiche 'history.json'");
}
function savePlayers(){
	// TODO better formart.
	writeFileSync("players.json",JSON.stringify(players,null,"\t"));
	console.log("Speiche 'players.json'");
}
function SHUTDOWN(){
	if(shutdown) return;
	shutdown=true;

	console.log(infoText+"Beende...");

	saveHistory();
	savePlayers();

	if(sleepingServerProcess){
		sleepingServerProcess.close();
		sleepingServerProcess=null;
	}

	if(serverStatus.pid){
		//minecraftJavaServerProcess.exit("SIGINT")
		minecraftJavaServerProcess.stdin.write(server.serverType==="proxy/bungee"?"end\n":"stop\n");
	}
	else process.exit(0);
}

if(processArgs.length<2&&!server){
	console.log("Es Fehlen Infomaitonen!");
	process.exit(1);
}
else if(!server){
	servers=JSON.parse(readFileSync(config_servers,"utf-8"))
		.map(item=>({
			...config.template_server,
			...item,
		})
	);
	server=servers[getServerIndex(
		processArgs[1],
		processArgs[0].substring(2),
	)];
}

console.log(server);
if(!server){
	process.exit(1);

}

// TMP
const d=process.cwd();
console.log(d);

if(server.folder) process.chdir(server.folder);

let minecraftJavaServerProcess;
let sleepingServerProcess;

const serverStatusTemplate={
	id: server.id,
	pid: null,
	players: [],
	running: false,
	socketOnline: true,
	status: "Offline",
	statusColor: "red",
};
let serverStatus=serverStatusTemplate;

try{
	histories=JSON.parse(readFileSync("history.json","utf-8"));
}catch(e){console.log("WARN: cant open history.json",e.message)}
try{
	players=JSON.parse(readFileSync("players.json","utf-8"));
}catch(e){console.log("WARN: cant open players.json",e.message)}

const io=socketIo(server.socketPort,{
	cors:{
		origin:"*",
	},
});
io.on("connection",onSocketConnection);

if(server.sleep_atStart){
	createSleepingServerProcess();
	console.log(infoText+"Minecraft-Server is sleeping ...");

	updateServerStatus("loadTemplate");
	updateServerStatus("key",{
		key: "status",
		value: "Sleeping",
	});
}
else if(!server.sleep_atStart){
	createMinecraftJavaServerProcess();
	console.log(infoText+"Minecraft-Server is running on PID "+serverStatus.pid);

}

process.stdin.on("data",buffer=>{
	const text=buffer.toString("utf-8");	// buffer => text
	let msg=text.split("\n").join("");

	if(msg.startsWith("/")){
		msg=msg.substring(1).trim();
	}else{
		msg="say "+msg;
	}
	if(
		server.serverType!="proxy/bungee"&&
		!minecraftJavaServerProcess.stdout.closed
	)
		minecraftJavaServerProcess.stdin.write(msg+"\n");
});

process.on("SIGINT",SHUTDOWN);
