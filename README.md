# Minecraft Server Starter

## Benötigt:
- Linux
- Minecraft Java Server
- Java -> `sudo apt install openjdk-17-jdk`
- Screen -> `sudo apt install screen`
- NodeJS -> `sudo apt install nodejs`

## Erste Einrichtung
- einen *cache* ordner erstellen
### in *config.json*
- Standert **java version** einstellen (defult: "*java*")
- Standert **RAM** einstellen (defult: *4G*)
- **Server Path einrichten** erstelle dafür einen ordner in deinen eigenen dateien den du minecraft server nennst davon gibst du den *path* an

### in *servers.json*
- lösche datei inhalt von *servers.json*
- Pro server der sich in der angegebenen *config.json* unter path befindet wird dann der server erwartet also zb

ich besitze einen server in ~/MinecraftServer/testServer

- dann gebe in *config.json* den path an `~/MinecraftServer/testServer`
- schreibe dann in *server.json* `[ {name:"Test Server", folder:"testServer", screenName:"minecraftServer_test"} ]` wenn der parameter *startType* auf *user* gestellt ist startet der server nicht automatisch!
- der rest wird in die config ergenst beim ausführen!

## Wie ausführen?
- `./minecraftServer_runner.js` alternnativ `node minecraftServer_runner.js`, dann erscheint da `Test Server => wird gestartet ...`, dann leuft der server
- um die console zu öffnen `screen -r minecraftServer_test` eingeben, zum schliessen *STRG+A+D* drücken
- wenn du dir nicht mehr sicher bist ob dein server leuft oder nicht kannst du in der *servers.json* nachsehen da wird dann `info:{running:<Boolean>}` hinzu gekommen sein
- zum stoppen des servers einfach wie gewont ins server terminal *stop* eingeben
- start check: wenn der server bereits gestartet ist kannst du den server runner noch mal aus führen es werden nur server gestartet die nicht laufen und wo `startType:"auto"` aktiv ist
- zum stoppen aller server einfach `pkill java` eingeben achtung das killt alle java processe also wenn die andere java programme laufen haben ist dies nicht empfohlen info: durch den *pkill* befehl wird der server noch gespeichert und nicht sofort beendent!

###### ich lege kein wert auf rechtschreibung auserdem ist es zu diesem zeitpunkt eo ich diese readme schreibe 01:43 des wegen kann ich nicht denken!
