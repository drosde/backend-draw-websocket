var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const cors = require('cors');


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
        intvHintUpdt: null
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
        intvHintUpdt: null
    },
},{
    id: 'room3',
    clients: [],
    playerTurnID: "",
    word: "",    
    gameHelpers: {
        wordHint: "",
        lastWordUpdate: new Date(),
        shuffledWord: [],
        intvHintUpdt: null
    },
}];

rooms.forEach(room => {
    room.word = getNewWord();
    room.gameHelpers.wordHint = "_".repeat(room.word.length);

    let w_array = room.word.split("").map((ltt, i) => ltt = {pos: i, ltt: ltt});

    room.gameHelpers.shuffledWord = shuffle(w_array);
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

    socket.on('leave-room', (data) => {
        if(data.room){
            socket.leave(data.room);

            let room = getRoomById(data.room);
            let clientsLng = room.clients.length-1;
            console.log(`please free me from the room ${data.room}, has ${clientsLng +1} clients`);

            // remove user
            if(room & clientsLng > 0){
                room.clients = room.clients.filter(user => user.id != socket.id)
                console.log('Room now has ' + clientsLng+1 + ' clients');
            };
            
            // and then if there's no users in the room
            if(room && clientsLng == 0){
                resetRoom(room, true);
                console.log('room cleaned');
            }
        }
    });
    
    socket.on('disconnect', function(){
        let room = getRoomByUserId(socket.id);
        if(room) room.clients = room.clients.filter(user => user.id != socket.id);         
        
        if(room && room.clients.length == 0){
            resetRoom(room, true);
        }
        
        console.log(`Usuario desconectado ${socket.id}, estaba en una sala? ${ room ? 'si, sala '+room.id : 'no'}`);      
    });
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

    // if room is empty
    if(c_room.clients.length == 0){        
        // without timeout the clients doesn't receive this
        setTimeout(() => changeDavinci(data.room, socket.id), 500);

        // Start sending hints
        c_room.gameHelpers.intvHintUpdt = setInterval(() => initHintInterval(c_room), 18000 / 2.2);
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
        if(message.content == room.word && socket.id != room.playerTurnID){
            console.log(`User ${message.author} WON THE GAME!`);

            onUserGuess(message, room, socket);
        }
    });

    // SEND USER CONNECTED EVENT TO ALL USERS IN THAT ROOM
    socket.broadcast.in(data.room).emit('user-connected-room', user);

    // SEND INFO OF THAT ROOM TO USER CONNECTED
    io.sockets.to(socket.id).emit('room-info', {clients: c_room.clients, playerTurnID: c_room.playerTurnID, wordLength: c_room.word.length});
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

/**
 * 
 * @param {string} id
 * @returns {object} room
 */
function getRoomByUserId(id){
    let res;
    rooms.forEach(room => {
        if(room.clients.find(el => el.id == id)){
            res = room;
        }
    });
    return res;
}

/**
 * 
 * @param {object} room 
 * @returns {string} PlayerID
 */
function getNewDavinci(room){
    if(room){
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

/**
 * Changue drawer, update word and emit the new word
 * @param {object} data message data
 * @param {object} room room object
 * @param {object} socket socket object
 */
function onUserGuess(data, room, socket){
    let user = room.clients.find(user => user.id == socket.id);
    user.points += 50;
    user.guess = true;

    // if: only 2 users or all users guessed
    if(room.clients.length -1  <= 1 || room.clients.every((user) => user.guess)){
        prepareRoomNewMatch(room);
                
        changeDavinci(data.room, getNewDavinci(room).id);
    }

    io.sockets.in(data.room).emit('game-points-update', {user: socket.id, points: user.points});
}

/**
 * 
 * @param {object} room 
 */
function prepareRoomNewMatch(room){
    room.word = getNewWord();
    room.gameHelpers.wordHint = "_".repeat(room.word.length);
    room.lastWordUpdate = new Date();
    room.clients = room.clients.map(user => user.guess = false);
    
    let w_array = room.word.split("").map((ltt, i) => ltt = {pos: i, ltt: ltt});
    room.gameHelpers.shuffledWord = shuffle(w_array);

    io.sockets.in(room.id).emit('game-word-update', {type: 'word-update', wordLength: room.word.length});
    // io.sockets.in(room.id).emit('game-word-update', {type: 'hint-update', wordLength: room.word.length});
}

/**
 * Send a event telling everyone the new davinci
 * @param {string} roomID room to send the event
 * @param {string} playerTurnID new davinci ID
 */
function changeDavinci(roomID, playerTurnID){
    io.sockets.in(roomID).emit('game-davinci-update', playerTurnID);

    let room = getRoomById(roomID);
    if(room){
        room.playerTurnID = playerTurnID;
    }
}

//Calculate match time with Math.abs(date1 - date2) / (1000 * 60)
function initHintInterval(room){
    if(room){
        let poped = room.gameHelpers.shuffledWord.pop();
        if(poped){
            room.gameHelpers.wordHint = setCharAt(room.gameHelpers.wordHint, poped.pos, poped.ltt);
            console.log(`New letter ADDED: POSITION ${poped.pos}, LETTER ${poped.ltt}.`);
            console.log(`Updated room hint: ${room.gameHelpers.wordHint} Shufled Word: ${JSON.stringify(room.gameHelpers.shuffledWord)}`);

            io.sockets.in(room.id).emit('game-word-update', {type: 'hint-update', hint: room.gameHelpers.wordHint});
        }else{
            // TIME IS OVER. GET NEW WORD AND NEW DAVINCI
        }
    }
}

function resetRoom(room, resetClients){
    if(room.gameHelpers.intvHintUpdt) clearInterval(room.gameHelpers.intvHintUpdt);

    room.word = getNewWord();
    if(resetClients) room.clients = [];
    room = {
        id: room.id,
        playerTurnID: "",
        word: "",    
        gameHelpers: {
            wordHint: "",
            lastWordUpdate: new Date(),
            shuffledWord: [],
            intvHintUpdt: null
        },
    }

    room.word = getNewWord();
    room.gameHelpers.wordHint = "_".repeat(room.word.length);

    let w_array = room.word.split("").map((ltt, i) => ltt = {pos: i, ltt: ltt});
    room.gameHelpers.shuffledWord = shuffle(w_array);
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

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}