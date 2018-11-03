var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const cors = require('cors');


// simulate storage server
var maxRoomClient = 2;
var rooms = [{
    id: 'room1',
    clients: []
},{
    id: 'room2',
    clients: []
},{
    id: 'room3',
    clients: []
}];

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

    res.status(200).send(payload);
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

    socket.on('join-room', (room) => {
        socket.join(room, () => {
            let r = getRoomById(room);
            if(r) r.clients.push({id: socket.id})
            console.log("Ingresando usuario a la sala: ", room);
        });
    })
    
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
}

/**
 * Server config
 */
http.listen(3000, function(){
    console.log('listening on *:3000');
});

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