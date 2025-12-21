//const { jest  } = require('@jest/globals');


const Faker = {
  Math: {
    mockRandom: function(val) {
      return jest.spyOn(global.Math, 'random').mockReturnValue(val);
    },


    randomNumber: function(max=1000) {
      return Math.ceil(Math.random() * max)
    }
  },


  Text: {
    randomString: function(length=1) {
      let result = '';
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const charactersLength = characters.length;
      while (result.length < length) {
        let idx = Faker.Math.randomNumber(charactersLength-1);
        result += characters.charAt(idx);
      }
      return result;
    }
  }
};


module.exports = {
  Faker
}
