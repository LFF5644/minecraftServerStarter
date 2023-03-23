#!/opt/node-v18.15.0-linux-x64/bin/node
const {readFileSync,writeFile}=require("fs");
const http=require("http");
const {spawn}=require("child_process");
const mcp=require("minecraft-protocol");
const [node,thisFile,...processArgs]=process.argv;
let path=thisFile.split("/");
path.pop();
path=path.join("/");

const infoText="\x1b[32mINFO: \x1b[0m";
const config_servers=path+"/servers.json";
const config_file=path+"/config.json";
const config=JSON.parse(readFileSync(config_file,"utf-8"));
const servers=JSON.parse(readFileSync(config_servers,"utf-8"))
	.map(item=>({
		...config.template_server,
		...item,
	})
);

process.chdir(path);
process.chdir(config.path);

const sessionData={
	shutdownAction: "exit",
};
const players={};
const serverStatus={
	running:false,
	status:"Offline",
	statusColor:"red",
	playersOnline:0,
	players:[],
	pid:null,
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
function save(){
	let config_=JSON.stringify(serverStatus,null,2).split("  ").join("\t");
	if(sessionData.lastSaveStr!=config_){
		sessionData.lastSaveStr=config_;
		writeFile(config_serverStatus,config_,function(){});
	}
}
function createMinecraftJavaServerProcess(){
	minecraftJavaServerProcess=spawn(server.javaPath=="java"?"/usr/bin/java":server.javaPath,[
		"-Xmx"+(server.ram?server.ram:"256M"),
		"-jar",
		server.serverJar,
	]);

	minecraftJavaServerProcess.on("exit",minecraftJavaServerProcessOnExit);
	minecraftJavaServerProcess.stdout.on("data",minecraftJavaServerProcessOnSTDOUT);

	return minecraftJavaServerProcess;
}
function minecraftJavaServerProcessOnExit(code){
	if(sessionData.shutdownAction==="exit"){
		console.log("");
		console.log(code?"Minecraft-Server CRASHED: "+code:"Minecraft-Server Exited!");

		serverStatus.running=false;
		serverStatus.status=code?"CRASHED!":"Offline";
		serverStatus.statusColor=code?"red":null;
		serverStatus.playersOnline=0;
		serverStatus.players=[];
		serverStatus.pid=null;

		save();
		setTimeout(console.log,5e3,"Exit in 3s ....");
		setTimeout(process.exit,7e3,0);
	}
	else if(sessionData.shutdownAction==="sleep"&&code===0){
		console.log(infoText+"Minecraft Server is Sleeping ....");

		serverStatus.running=false;
		serverStatus.status="Sleeping";
		serverStatus.statusColor=code?"red":null;
		serverStatus.playersOnline=0;
		serverStatus.players=[];
		serverStatus.pid=null;

		const sleepingServerProcess=mcp.createServer({
			"online-mode": false,
			version: server.version,
			port: server.sleepingPort,
		});
		sleepingServerProcess.on("login",client=>{
			const playerName=client.username;
			client.end("Server wird gestartet ...");
			sleepingServerProcess.close();
			console.log(infoText+playerName+" Startet den Server ...");
			createMinecraftJavaServerProcess();
		});
		sleepingServerProcess.on("listening",()=>console.log(infoText+"Server Schläft auf Prot: "+server.sleepingPort));
		sleepingServerProcess.on("error",console.log);
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
				serverStatus.status="Startet ...";
			}
			else if(
				msg.startsWith("Done (")||
				msg.startsWith("Done(")
			){
				serverStatus.running=true;
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
					setTimeout(BEEP,1e3);	// let pc beep in 1s
				}else{
					console.log("WARNUNG: player "+playerName+" not found!");
				}
			}
			else if(// LFF5644 lost connection: Disconnected
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
				console.log(infoText+"Server is running");
			}
			
		}
		else if(serverStatus.running){	// if server running

		}
	}
}

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
const config_serverStatus=process.cwd()+"/serverStatus.json";

let minecraftJavaServerProcess;
createMinecraftJavaServerProcess();
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

const httpServer=http.createServer((request,response)=>{
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
			const requireSleep=Boolean(Number(args));
			
			if(requireSleep){
				if(
					!serverStatus.running&&
					sessionData.shutdownAction==="sleep"
				){
					response.write("Server is already sleeping!");
				}else{
					sessionData.shutdownAction="sleep";
					minecraftJavaServerProcess.stdin.write("stop\n");
					response.write("Server is now sleeping ...");
					serverStatus.running=false;
				}
			}
			if(!requireSleep){
				if(!serverStatus.running){
					sessionData.shutdownAction="exit";
					response.write("Wake up server ....");
				}else{
					response.write("Server is already awake!");
				}
			}
		}
	}
	response.end();

});

serverStatus.pid=minecraftJavaServerProcess.pid;
if(server.httpPort) httpServer.listen(server.httpPort);
if(server.httpPort) console.log("HTTP-Server is Running on port "+server.httpPort);
console.log("Minecraft-Server is running on PID "+minecraftJavaServerProcess.pid);

save();
setInterval(save,5e3);	// save all 5s
