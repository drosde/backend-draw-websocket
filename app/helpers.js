module.exports = {   
    setCharAt: function (str, index, chr){
        if (index > str.length - 1) return str;
        return str.substr(0, index) + chr + str.substr(index + 1);
    },

    shuffle: function (a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },    

    randomInt: function(max){
        return Math.floor(Math.random() * (max - 0 + 1)) + 0;
    },    

    getNewWord: function(words){
        return words[this.randomInt(words.length -1)];
    },

    compressShuffledStr: function(obj){
        var s = JSON.stringify(obj);
        return s.replace(/\[|\]|{|}|"|"/g, '').replace(/,([a-z])/g, ' $1').replace(/([a-z]) (pos)/g, '$1, $2');
    },
};