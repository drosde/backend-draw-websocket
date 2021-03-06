var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const cors = require('cors');

var helper = require('./helpers');


// simulate storage server
var maxRoomClient = 5;
var words = ('remera,iglesia,perro,gato,mariposa,cerveza,hacha,escuela,'+
            'cama,calle,sol,murcielago,campana,mouse,auricular,tren,automovil,ventana').split(',');

var rooms = [{
    id: 'room1',
    clients: [],
    playerTurnID: "",
    word: "",    
    gameHelpers: {
        wordHint: "",
        lastWordUpdate: new Date(),
        shuffledWord: [],
        intvHintUpdt: null,
        points: [],
        histDrawn: {
            points: {lines: "", dot: "" }
        },
        timer: 0,
        lastTimerUpdate: null
    },
},{
    id: 'room2',
    clients: [],
    playerTurnID: "",
    word: "",    
    gameHelpers: {
        wordHint: "",
        lastWordUpdate: new Date(),
        shuffledWord: [],
        intvHintUpdt: null,
        points: [],
        histDrawn: {points: {lines: "", dot: "" }},
        timer: 0,
        lastTimerUpdate: null
    },
}];

rooms.forEach(room => {
    room.word = helper.getNewWord(words);
    room.gameHelpers.wordHint = "_".repeat(room.word.length);

    let w_array = room.word.split("").map((ltt, i) => ltt = {pos: i, ltt: ltt});

    room.gameHelpers.shuffledWord = helper.shuffle(w_array);
})

/**
 * Cors
 */
var corsOptions = {
    origin: 'http://localhost:4200',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204 
}
app.use(cors(corsOptions));


/**
 * Routes
 */
app.get('/', function(req, res){
    res.send(200, {});
});

app.get('/rooms', function(req, res){
    let avlb = getAvailableRoom();
    let payload = {};
    
    if(avlb) 
        payload.availableRoom = avlb.id
    else
        payload.availableRoom = null

    // test spinner in client
    setTimeout(() => res.status(200).send(payload), 1500);
});


/**
 * Socket io events
 */
io.on('connection', onConnection);

function onConnection(socket){
    console.log('a user connected');

    socket.on('join-room', (data) => {
        if(data.room && data.username){
            socket.join(data.room, onSocketJoinRoom(socket, data));
        }
    });
    
    socket.on('leave-room', data => onSocketLeaveRoom(socket, data));
    
    socket.on('disconnect', function(){
        let room = getRoomByUserId(socket.id);
        if(room) room.clients = room.clients.filter(user => user.id != socket.id);         
        
        if(room && room.clients.length == 0){
            resetRoom(room.id);
        }
        
        console.log(`Usuario desconectado ${socket.id}, sala ${ room ? 'si, '+room.id : 'no'}`);      
    });
}

// Once a user join a room
function onSocketJoinRoom(socket, data){
    let c_room = getRoomById(data.room);
    let user = {
        username: data.username,
        points: 0,
        id: socket.id,
    }

    // if room is empty
    console.log('Room is empty?', c_room.clients.length == 0 );
    if(c_room.clients.length == 0){        
        // without timeout the clients doesn't receive this
        setTimeout(() => changeDavinci(data.room, socket.id), 500);

        // Start sending hints. MAX TIME / WORD LENGHT -> TO MS
        c_room.gameHelpers.intvHintUpdt = setInterval(() => initHintInterval(c_room), (90 / c_room.word.length) * 1000);
        // console.log('START THE DEAM INTV');
        console.log('WORD:', c_room.word);
    }

    // ADD USER TO ROOM AND SEND USER CONNECTED EVENT TO ALL USERS IN THAT ROOM
    if(c_room) c_room.clients.push(user) 
    
    socket.broadcast.in(data.room).emit('user-join-leave-room', {type: 'join', user});

    console.log(`User ${data.username} join room ${data.room}`);

    var time = new Date();
    var roomTime = c_room.gameHelpers.lastTimerUpdate ? (Math.abs(time - c_room.gameHelpers.lastTimerUpdate) / 1000) + c_room.gameHelpers.timer : 0;
    console.log("room time data", `timer ${c_room.gameHelpers.timer} abs ${Math.abs(time - c_room.gameHelpers.lastTimerUpdate) / 1000}`)
    console.log("room time", roomTime);
    process.stdout.write("\n");   
    
    // 1. SEND INFO OF THAT ROOM TO USER CONNECTED
    io.sockets.to(socket.id).emit('room-info', {
        clients: c_room.clients, 
        playerTurnID: c_room.playerTurnID, 
        wordLength: c_room.word.length,
        wordHint: c_room.gameHelpers.wordHint,
        roomTime: roomTime
    });

    // TODO: Join these events (1 & 2)
    // 2. SEND HISTORIAL
    let histD = c_room.gameHelpers.histDrawn.points;
    if(histD.lines.length > 0 || histD.dot.length > 0){
        setTimeout(() => {
            io.sockets.to(socket.id).emit('drawed-data', {
                points: c_room.gameHelpers.histDrawn.points,
                color: "#fff"
            }); 
        }, 2000);
    }

    // RECEIVE DRAW EVENT FROM Davinci AND BROADCAST TO USERS IN ROOM: MSG.ROOM
    socket.on('drawed-data', msg => {
        if(msg.id == c_room.playerTurnID) {
            socket.broadcast.in(msg.room).emit('drawed-data', msg);

            let hist = c_room.gameHelpers.histDrawn.points;
            let points = msg.points;

            for(var prop in hist){
                var p = points[prop];
                if(typeof p == "string"){
                    hist[prop] += hist[prop].length == 0 || p.charAt(hist[prop].length - 1) == "," ? p : "," + p;
                }
            }
        }
    });

    // SAME AS ABOVE
    socket.on('chat-message', (message) => {
        // send the message to the rest
        io.sockets.in(message.room).emit('chat-message', message);

        let room = getRoomById(message.room);

        // victory
        if(message.content == room.word && socket.id != room.playerTurnID){
            onUserGuess(message, room, socket);
        }
    });

    socket.on('game-clear-canvas', (data) => {
        if(data.id == c_room.playerTurnID) {
            socket.broadcast.in(data.room).emit('game-clear-canvas');
        }
    });
}

function onSocketLeaveRoom(socket, data){
    if(data.room){
        socket.leave(data.room);

        let room = getRoomById(data.room);
        let clients = room.clients;

        room.clients = room.clients.filter(user => user.id != socket.id); // sacamos al cliente de la lista

        io.sockets.in(data.room).emit('user-join-leave-room', {type: 'leave', id: socket.id}); // avisamos q se fue

        if(room && clients.length-1 === 0){
            resetRoom(room.id);
            console.log('room cleaned');
            process.stdout.write("\n");
            process.stdout.write("\n");
        }else if(room){
            if(room.playerTurnID === socket.id){
                changeDavinci(data.room, getNewDavinci(room).id);
            }
        }
    }
}

/**
 * Server config
 */
http.listen(3000, function(){
    console.log('listening on *:3000');
});

/**
 * Helpers / functions *
 */

 
/**
 * Change drawer, update word and emit a new word
 * @param {object} data message data
 * @param {object} room room object
 * @param {object} socket socket object
 */
function onUserGuess(data, room, socket){    
    console.log(`User ${data.author} WON THE GAME!`);

    let user = room.clients.find(user => user.id == socket.id);
    user.points += 50;
    user.guess = true;

    // if: only 2 users or all users guessed
    if(room.clients.length -1  <= 1 || room.clients.every((user) => user.guess)){
        prepareRoomNewMatch(room);

        console.log("Match Ended");
        process.stdout.write("\n");
                
        changeDavinci(data.room, getNewDavinci(room).id);
    }

    io.sockets.in(data.room).emit('game-points-update', {user: socket.id, score: user.points});

    io.sockets.in(data.room).emit('game-clear-canvas');
}

/**
 * 
 * @param {object} room 
 */
function prepareRoomNewMatch(room){
    room.word = helper.getNewWord(words);
    room.gameHelpers.wordHint = "_".repeat(room.word.length);
    room.lastWordUpdate = new Date();
    
    room.clients.map(user => user.guess = false); // reset gues status
    
    let w_array = room.word.split("").map((ltt, i) => ltt = {pos: i, ltt: ltt});
    room.gameHelpers.shuffledWord = helper.shuffle(w_array);

    io.sockets.in(room.id).emit('game-word-update', {type: 'word-update', wordLength: room.word.length});
    // io.sockets.in(room.id).emit('game-word-update', {type: 'hint-update', wordLength: room.word.length});
}

/**
 * Send a event telling everyone the new davinci
 * @param {string} roomID room to send the event
 * @param {string} playerTurnID new davinci ID
 */
function changeDavinci(roomID, playerTurnID){
    console.log('change davinci', playerTurnID);

    let room = getRoomById(roomID);
    io.sockets.in(roomID).emit('game-davinci-update', playerTurnID);
    
    if(room){
        io.sockets.to(playerTurnID).emit('game-word-update', {type: 'word-2draw', word: room.word});
        room.playerTurnID = playerTurnID;
        room.gameHelpers.histDrawn = {
            points: {
                lines: "",
                dot: ""
            }
        };
    }
}

function getAvailableRoom(){
    return rooms.find(el => el.clients.length < maxRoomClient);
}

function getRoomById(id){
    return rooms.find(el => el.id == id);
}

/**
 * 
 * @param {string} id
 * @returns {object} room
 */
function getRoomByUserId(id){
    return rooms.find(room => room.clients.find(us => us.id == id));
}

/**
 * 
 * @param {object} room 
 * @returns {string} PlayerID
 */
function getNewDavinci(room){
    if(room && room.clients.length > 0){
        let next = 0;
        let currDI = room.clients.findIndex(us => us.id == room.playerTurnID);
        if(currDI != room.clients.length -1){
            next = currDI + 1;
        }        
        let nextDavinci = room.clients[next];
        nextDavinci.guess = true;   // set this because otherwise when check with "clients.every users.guess" 
                                    // always it's going to return false                                    
        room.playerTurnID = nextDavinci.id;
        return nextDavinci;
    }else{
        return null;
    }
}

//Calculate match time with Math.abs(date1 - date2) / (1000 * 60)
function initHintInterval(room){
    if(room){
        let poped = room.gameHelpers.shuffledWord.pop();
        
        if(poped){
            room.gameHelpers.wordHint = helper.setCharAt(room.gameHelpers.wordHint, poped.pos, poped.ltt);
            io.sockets.in(room.id).emit('game-word-update', {type: 'hint-update', hint: room.gameHelpers.wordHint});

            room.gameHelpers.timer += (90 / room.word.length);
            room.gameHelpers.lastTimerUpdate = new Date();

            console.log("Tiempo transcurrido ", room.gameHelpers.timer.toFixed(2) + " segundos");
            console.log("last date", room.gameHelpers.lastTimerUpdate);
        }else{
            // TIME IS OVER. GET NEW WORD AND NEW DAVINCI
        }
    }
}

function resetRoom(roomID){
    let room = getRoomById(roomID);

    room.word = helper.getNewWord(words);
    room.gameHelpers.wordHint = "_".repeat(room.word.length);

    let w_array = room.word.split("").map((ltt, i) => ltt = {pos: i, ltt: ltt});
    room.gameHelpers.shuffledWord = helper.shuffle(w_array);

    room.clients = [];

    room.gameHelpers.lastWordUpdate = new Date();

    room.gameHelpers.histDrawn = {
        points: {
            lines: "",
            dot: ""
        }
    };
    
    if(room.gameHelpers.intvHintUpdt){
        clearInterval(room.gameHelpers.intvHintUpdt);
        room.gameHelpers.intvHintUpdt = null;
        // console.log(`Interval limpio? `, room.gameHelpers.intvHintUpdt);
    } 

    room.gameHelpers.timer = 0;
    room.gameHelpers.lastTimerUpdate = null;
    
    console.log(`New room word: ${room.word}, suffled:`, helper.compressShuffledStr(room.gameHelpers.shuffledWord));
}