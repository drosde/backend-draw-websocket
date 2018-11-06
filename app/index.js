var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const cors = require('cors');


// simulate storage server
var maxRoomClient = 5;
var words = ('remera,iglesia,perro,gato,mariposa,cerveza,hacha,escuela'+
            ',cama,calle,sol,murcielago,campana,mouse,auricular,tren,automovil,ventana').split(',');
var rooms = [{
    id: 'room1',
    clients: [],
    playerTurnID: "",
    word: "",
    wordHint: ""
},{
    id: 'room2',
    clients: [],
    playerTurnID: "",
    word: "",
    wordHint: ""
},{
    id: 'room3',
    clients: [],
    playerTurnID: "",
    word: "",
    wordHint: ""
}];

rooms.forEach(room => {
    room.word = getNewWord();
    // room.tempWord = room.word; 
    let r = randomInt(room.word.length - 1);
    room.wordHint = "_".repeat(room.word.length);
    room.wordHint = setCharAt(room.wordHint, r, room.word.charAt(r));
    // room.wordHint = isCharAtSimilar(room.wordHint,0, "_") ? setCharAt(room.wordHint, r, room.word.charAt(r)) : room.wordHint;
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
    // if(socket.handshake.query.joinRoom){
    //     let r = getRoom();
    //     if(r) socket.join(r.id);
    // }

    socket.on('join-room', (data) => {
        if(data.room && data.username){
            socket.join(data.room, onSocketJoinRoom(socket, data));
        }
    });
    
    socket.on('disconnect', function(){
        let b = getRoomByUserId(socket.id);
        console.log(`Usuario desconectado ${socket.id}, estaba en una sala? ${ b ? 'si, sala '+b : 'no'}`);        
    });

    // socket.on('get-users-in-room', (room) => {
    //     io.sockets.to(socket.id).emit('get-users-in-room', message);
    // });
}

// Once a user join a room
function onSocketJoinRoom(socket, data){
    let c_room = getRoomById(data.room);
    let user = {
        username: data.username,
        // drawing: c_room.clients.length == 0 ? true : false,
        points: 0,
        id: socket.id,
    }

    if(c_room.clients.length == 0){        
        // without timeout the clients doesn't receive this
        setTimeout(() => changeDavinci(data.room, socket.id), 500);
    }

    if(c_room) c_room.clients.push(user)
    console.log("Ingresando usuario a la sala: ", data.room + " "+ data.username);    

    // RECEIVE DRAW EVENT FROM Davinci AND BROADCAST TO USERS IN ROOM: MSG.ROOM
    socket.on('drawed-data', (msg) => {
        socket.broadcast.in(msg.room).emit('drawed-data', msg);
    });

    // SAME AS ABOVE
    socket.on('chat-message', (message) => {
        // send the message to the rest
        io.sockets.in(message.room).emit('chat-message', message);

        let room = getRoomById(message.room);
        console.log(`Word: ${room.word}`);

        // victory
        if(message.content == room.word){
            console.log(`User ${message.author} WON THE GAME!`);

            let davinci = getNewDavinci(room);
            io.sockets.in(message.room).emit('game-davinci-update', davinci.id);

            room.word = getNewWord();
            room.wordHint = "_".repeat(room.word.length);

            console.log('New davinci!:', davinci);
        }
    });

    // SEND USER CONNECTED EVENT TO ALL USERS IN THAT ROOM
    socket.broadcast.in(data.room).emit('user-connected-room', user);

    // SEND INFO OF THAT ROOM TO USER CONNECTED
    io.sockets.to(socket.id).emit('room-info', {clients: c_room.clients, playerTurnID: c_room.playerTurnID});
}

/**
 * Server config
 */
http.listen(3000, function(){
    console.log('listening on *:3000');
});

/**
 * Helpers / functions
 */
function getAvailableRoom(){
    return rooms.find(el => el.clients.length < maxRoomClient);
}

function getRoomById(id){
    return rooms.find(el => el.id == id);
}

function getRoomByUserId(id){
    let res;
    rooms.forEach(room => {
        if(room.clients.find(el => el.id == id)){
            res = room.id;
        }
    });
    return res;
}

function getNewWord(){
    return words[randomInt(words.length -1)];
}

function randomInt(max){
    return Math.floor(Math.random() * (max - 0 + 1)) + 0;
}

function setCharAt(str, index, chr){
    if (index > str.length - 1) return str;
    return str.substr(0, index) + chr + str.substr(index + 1);
}

function isCharAtSimilar(str, indx, sim){
	if(indx > str.length -1) return;
	var char = str.charAt(indx);
	return char === sim ? true : false; 
}

function getNewDavinci(room){
    if(room){
        let next = 0;
        let currDI = room.clients.findIndex(us => us.id == room.playerTurnID);
        if(currDI != room.clients.length -1){
            next = currDI + 1;
        }        
        let nextDavinci = room.clients[next];

        room.playerTurnID = nextDavinci.id;
        return nextDavinci;
    }else{
        return null;
    }

//     var us = rooms[rand];
// if(us.id.charAt(0) == "b"){
// 	while(us.id.charAt(0) == "b"){
// 		var r = randomInt(rooms.length -1);
// 		us = rooms[r];
// 	}
// 	console.log(us)
// }
}

function changeDavinci(roomID, playerTurnID){
    // io.sockets.in(roomID).emit('game-davinci-update', playerTurnID);
    io.sockets.in(roomID).emit('game-davinci-update', playerTurnID);

    let room = getRoomById(roomID);
    if(room){
        room.playerTurnID = playerTurnID;
    }
}