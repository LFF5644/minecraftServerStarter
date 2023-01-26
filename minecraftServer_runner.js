#!/usr/bin/env node
const {execSync}=require("child_process");
const serverDir="/home/lff/Programmes/MinecraftServer";
const settings={
	//restart:false,
	run:true,
	ram:"4G",
	serverJar:"paper-1.12.2.jar",
	javaPath:"/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
}
const servers=[
	{
		folder:"BungeeCordServer",
		serverJar:"BungeeCord.jar",
		screenName:"minecraftServer_bungee",
		ram:null,
	},
	{
		folder:"minecraftServer_lobby",
		ram:"2G",
	},
	{
		folder:"minecraftServer_survival",
	},
	{
		folder:"minecraftServer_creative",
	},
	{
		folder:"minecraftServer_1.19.3_creative",
		serverJar:"paper-1.19.3.jar",
		screenName:"minecraftServer_1.19.3_creative",
		javaPath:"java",
		run:false,
	},
];
process.chdir(serverDir);
let server="";
for(server of servers){
	server={
		...settings,
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
