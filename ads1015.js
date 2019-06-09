'use strict';

const
AP_CONVERSION      = 0x00,
AP_CONFIG          = 0x01,
AP_LO_THRESH       = 0x02,
AP_HI_THRESH       = 0x03,

CR0_COMP_QUE_1     = 0x00,
CR0_COMP_QUE_2     = 0x01,
CR0_COMP_QUE_4     = 0x02,
CR0_COMP_QUE_0     = 0x03,

CR0_COMP_LAT_OFF   = 0x00,
CR0_COMP_LAT_ON    = 0x04,

CR0_COMP_POL_LOW   = 0x00,
CR0_COMP_POL_HIGH  = 0x08,

CR0_DR_128         = 0x00,
CR0_DR_250         = 0x20,
CR0_DR_490         = 0x40,
CR0_DR_920         = 0x60,
CR0_DR_1600        = 0x80,
CR0_DR_2400        = 0xA0,
CR0_DR_3300        = 0xC0,

CR0_COMP_MODE_TRAD = 0x00,
CR0_COMP_MODE_WIND = 0x10,

CR1_MODE_CONT      = 0x00,
CR1_MODE_SING      = 0x01,

CR1_OS_NOP         = 0x00,
CR1_OS_START       = 0x80,

CR1_PGA_6144       = 0x00,
CR1_PGA_4096       = 0x02,
CR1_PGA_2048       = 0x04,
CR1_PGA_1024       = 0x06,
CR1_PGA_0512       = 0x08,
CR1_PGA_0256       = 0x0A,

CR1_MUX_01         = 0x00,
CR1_MUX_03         = 0x10,
CR1_MUX_13         = 0x20,
CR1_MUX_23         = 0x30,
CR1_MUX_0G         = 0x40,
CR1_MUX_1G         = 0x50,
CR1_MUX_2G         = 0x60,
CR1_MUX_3G         = 0x70;

class ads1015 {
  constructor(busId, address) {
    this.i2c = require('i2c-bus');
    this.bus = this.i2c.openSync(busId || 1);
    this.ADDRESS = address || 0x48;

    this._config = {
      gainVal: 6.144,
      gain: CR1_PGA_6144,
      waitTime: 1,
      sps: CR0_DR_1600,
      streaming: null,
    };

    this.getConfig = function() {
      return {
        gainVal: this._config.gainVal,
        gain: this._config.gain,
        waitTime: this._config.waitTime,
        sps: this._config.sps,
        streaming: this._config.streaming
      };
    }
  }

  init(gain, sps) {
    if(gain !== undefined) {
      switch(gain) {
        case CR1_PGA_6144:
          this._config.gainVal = 6.144;
          break;
        case CR1_PGA_4096:
          this._config.gainVal = 4.096;
          break;
        case CR1_PGA_2048:
          this._config.gainVal = 2.048;
          break;
        case CR1_PGA_1024:
          this._config.gainVal = 1.024;
          break;
        case CR1_PGA_0512:
          this._config.gainVal = 0.512;
          break;
        case CR1_PGA_0256:
          this._config.gainVal = 0.256;
          break;
        default:
          throw 'Invalid gain specified: ' + gain;
          break;
      }
      this._config.gain = gain;
    }

    if(sps !== undefined) {
      switch(sps) {
        case CR0_DR_128:
          this._config.waitTime = 8;
          break;
        case CR0_DR_250:
          this._config.waitTime = 5;
          break;
        case CR0_DR_490:
        case CR0_DR_920:
          this._config.waitTime = 2;
          break;
        case CR0_DR_1600:
        case CR0_DR_2400:
        case CR0_DR_3300:
          this._config.waitTime = 1;
          break;
        default:
          throw 'Invalid samples per second specified: ' + sps;
          break;
      }
      this._config.sps = sps;
    }
  }

  async startStreaming0() { await this._startStreaming(CR1_MUX_0G); }
  async startStreaming1() { await this._startStreaming(CR1_MUX_1G); }
  async startStreaming2() { await this._startStreaming(CR1_MUX_2G); }
  async startStreaming3() { await this._startStreaming(CR1_MUX_3G); }

  async startStreaminDifferentialg01() { return await this._startStreaming(CR1_MUX_01); }
  async startStreamingDifferential03() { return await this._startStreaming(CR1_MUX_03); }
  async startStreamingDifferential13() { return await this._startStreaming(CR1_MUX_13); }
  async startStreamingDifferential23() { return await this._startStreaming(CR1_MUX_23); }

  async _startStreaming(channel) {
    var config = this.getConfig();
    await this.writeBytes(AP_CONFIG, Buffer.from([
      channel | config.gain | CR1_MODE_CONT | CR1_OS_START,
      config.sps | CR0_COMP_QUE_0 // | CR0_COMP_LAT_OFF | CR0_COMP_POL_LOW | CR0_COMP_MODE_TRAD
    ]));

    this._config.streaming = channel;
  }

  async readStreaming() {
    var config = this.getConfig();
    if(config.streaming === null)
      throw 'Device not streaming';

    var buffer = await this.readBytes(AP_CONVERSION, 2);
    return this._decodeValue(buffer, config.gainVal);
  }

  //have side effects of halting streaming mode
  async readDifferential01() { return await this._readSingle(CR1_MUX_01); }
  async readDifferential03() { return await this._readSingle(CR1_MUX_03); }
  async readDifferential13() { return await this._readSingle(CR1_MUX_13); }
  async readDifferential23() { return await this._readSingle(CR1_MUX_23); }

  //have side effects of halting streaming mode
  async read0() { return await this._readSingle(CR1_MUX_0G); }
  async read1() { return await this._readSingle(CR1_MUX_1G); }
  async read2() { return await this._readSingle(CR1_MUX_2G); }
  async read3() { return await this._readSingle(CR1_MUX_3G); }

  async _readSingle(channel) {
    var config = this.getConfig();
    await ads1015.acquireLock();

    await this.writeBytes(AP_CONFIG, Buffer.from([
      channel | config.gain | CR1_MODE_SING | CR1_OS_START,
      config.sps | CR0_COMP_QUE_0  // | CR0_COMP_LAT_OFF | CR0_COMP_POL_LOW | CR0_COMP_MODE_TRAD
    ]));

    this._config.streaming = null;
    await this.wait(config.waitTime);
    var buffer = await this.readBytes(AP_CONVERSION, 2);
    ads1015.releaseLock();
    return this._decodeValue(buffer, config.gainVal);
  }

  _decodeValue(buffer, gainval) {
    //signed 12 bit integer
    var raw = (buffer[0] << 4) | (buffer[1] >>> 4 );
    if(raw > 2047) //negative
      raw -= 4096;

    //scale 12 bit resolution to gain scale
    raw /= raw > 0? 2047 : 2048;
    return raw * gainval;
  }

  wait(waitTime) {
    return new Promise(resolve => setTimeout(resolve, waitTime));
  }

  readBytes(addr, len) {
    return new Promise((resolve, reject) =>
        this.bus.readI2cBlock(
          this.ADDRESS,
          addr,
          len,
          Buffer.allocUnsafe(len),
          (err, length, buffer) => err? reject(err) : resolve(buffer)));
  }

  writeBytes(addr, buffer) {
    return new Promise((resolve, reject) =>
      this.bus.writeI2cBlock(
        this.ADDRESS,
        addr,
        buffer.byteLength,
        buffer,
        (err) => err? reject(err) : resolve()));
  }
}

var _lock = false;
ads1015.acquireLock = function() {
  return new Promise(function exec(resolve, reject) {
    if(!_lock) {
      _lock = true;
      resolve();
    }
    else
      setImmediate(() => exec(resolve, reject));
  });
};

ads1015.releaseLock = function() {
  _lock = false;
};

module.exports = ads1015;
