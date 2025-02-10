#!/opt/node-v18.15.0-linux-x64/bin/node
const {readFileSync,writeFile}=require("fs");
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
	servers
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
			"shutdownAction": "exit"
		}
	};
}

if(config.path){
	process.chdir(path);
	process.chdir(config.path);
}

const sessionData={};
const players={};
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
function BEEP(){	// let MY pc beep if do not work try "sudo chmod 777 /dev/console"
	try{
		writeFile("/dev/console","\x07","utf-8",function(){});
	}catch(e){}
}
function createMinecraftJavaServerProcess(){
	minecraftJavaServerProcess=spawn(server.javaPath=="java"?"/usr/bin/java":server.javaPath,[
		"-Xmx"+(server.ram?server.ram:"256M"),
		"-jar",
		server.serverJar,
	]);
	updateServerStatus("key",{
		key: "pid",
		value: minecraftJavaServerProcess.pid,
	});

	minecraftJavaServerProcess.on("exit",minecraftJavaServerProcessOnExit);
	minecraftJavaServerProcess.stdout.on("data",minecraftJavaServerProcessOnSTDOUT);

	return minecraftJavaServerProcess;
}
function minecraftJavaServerProcessOnExit(code){
	const action=shutdownAction?shutdownAction:server.shutdownAction;

	if(action==="exit"||code!==0){
		console.log("");
		console.log(code?"Minecraft-Server CRASHED: "+code:"Minecraft-Server Exited!");

		updateServerStatus("loadTemplate");

		setTimeout(console.log,5e3,infoText+"Exit in 3s ....");
		setTimeout(process.exit,7e3,0);
		shutdownAction=null;
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
function minecraftJavaServerProcessOnSTDOUT(buffer){
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
				msg=="Stopping the server"||
				msg=="Stopping server"||
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
				!msg.startsWith("<")&&
				msg.includes(" logged in with entity id ")
			){
				const playerName=msg.substring(0,msg
					.split("")
					.findIndex(item=>item=="[")
				);
				if(Object.keys(players).includes(playerName)){
					players[playerName].online=true;
					updateServerStatus("playerJoin",playerName);
					onPlayerConnectionChange({
						playerName,
						type: "connect",
					});
					console.log(infoText+playerName+" Betritt das Spiel ("+serverStatus.players.length+" Spieler Online)");
					setTimeout(BEEP,1e3);	// let pc beep in 1s
				}else{
					console.log(infoText+"WARNUNG: player "+playerName+" not found!");
					kickPlayer(playerName,"Too Early! Try again!");
				}
			}
			else if(// LFF5644 lost connection: Disconnected
				!msg.startsWith("<")&&
				msg.includes(" lost connection: ")
			){
				const playerName=msg.substring(0,msg
					.split("")
					.findIndex(item=>item===" ")
				);
				if(Object.keys(players).includes(playerName)){
					players[playerName].online=false;
					updateServerStatus("playerLeft",playerName);
					onPlayerConnectionChange({
						playerName,
						type: "disconnect",
					});
					console.log(infoText+playerName+" Verlässt das Spiel ("+(serverStatus.players.length)+" Spieler Online)");
					BEEP();
					setTimeout(BEEP,2e2);
				}else{
					console.log(infoText+"WARNUNG: player "+playerName+" not found!");
				}
			}
			else if(// <LFF5644> Hallo
				msg.startsWith("<")&&
				msg.includes(">")
			){
				const playerNameEnd=msg.split("").findIndex(item=>item===">");
				const playerName=msg.substring(1,playerNameEnd);
				if(Object.keys(players).includes(playerName)){
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
						console.log(infoText+playerName+": "+playerMsg);
					}
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
		process.exit(0);
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
function onPlayerConnectionChange(data){
	const {playerName,type}=data;
	const playersOnline=serverStatus.players.length;
	if(server.sleep){
		if(playersOnline===0){
			console.log(infoText+"Server goes sleeping in "+server.sleep_time+" minute"+(server.sleep_time>1?"s":""));
			const time=server.sleep_time*1e3*60;
			sessionData.timeout_sleep=setTimeout(setSleeping,time,true);
		}
		else if(playersOnline!==0){
			clearTimeout(sessionData.timeout_sleep);
		}
	}
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
	socket.on("kickPlayer",kickPlayer);
	socket.on("beep",BEEP);
	socket.on("executeCommand",cmd=>{
		minecraftJavaServerProcess.stdin.write(cmd+"\n");
	});
	socket.on("disconnect",()=>{
		// remove client form clients list
		socketClients=socketClients.filter(item=>item.id!==socket.id);
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
		serverStatus={
			...serverStatusTemplate,
			...serverStatus,
			players:[
				...serverStatus.players,
				data,
			],
		};
		io.emit("playerJoin",data);
	}
	else if(type=="playerLeft"){
		serverStatus={
			...serverStatusTemplate,
			...serverStatus,
			players: serverStatus.players
				.filter(item=>item!==data),
		};
		io.emit("playerLeft",data);
	}
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
console.log(d)

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
