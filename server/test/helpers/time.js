//const { jest  } = require('@jest/globals');


const Time = {
  setSystemTime: function (date) {
    this.useFakeTimers();
    jest.setSystemTime(date);
  },


  advanceTimers: function(ms) {
    jest.advanceTimersByTime(ms);
  },


  useFakeTimers: function() {
    jest.useFakeTimers();
  },


  useRealTimers: function() {
    jest.useRealTimers();
  }
}


module.exports = {
  Time
}
