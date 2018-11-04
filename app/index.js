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
    word: "",
    wordHint: ""
},{
    id: 'room2',
    clients: [],
    word: "",
    wordHint: ""
},{
    id: 'room3',
    clients: [],
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

    socket.on('drawed-data', (msg) => {
        socket.broadcast.in(msg.room).emit('drawed-data', msg);
    });

    socket.on('chat-message', (message) => {
        io.sockets.in(message.room).emit('chat-message', message);
    });

    socket.on('get-users-in-room', (room) => {
        io.sockets.to(socket.id).emit('get-users-in-room', message);
    });
}

function onSocketJoinRoom(socket, data){
    let r = getRoomById(data.room);
    let user = {
        username: data.username,
        drawing: r.clients.length == 0 ? true : false,
        points: 0,
        id: socket.id,
    }

    if(r) r.clients.push(user)
    console.log("Ingresando usuario a la sala: ", data.room + " "+ data.username);

    // SEND USER CONNECTED EVENT TO ALL USERS IN THAT ROOM
    socket.broadcast.in(data.room).emit('user-connected-room', user);

    // SEND USERS IN THAT ROOM TO USER CONNECTED
    io.sockets.to(socket.id).emit('users-in-room', r.clients);

    // SEND WORD DATA TO CONNECTED
    io.sockets.to(socket.id).emit('game-word-update', {
        wordLength: r.word.length,

    });
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