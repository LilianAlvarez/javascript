'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _subscribe = require('../endpoints/subscribe');

var _subscribe2 = _interopRequireDefault(_subscribe);

var _presence = require('../endpoints/presence');

var _presence2 = _interopRequireDefault(_presence);

var _time = require('../endpoints/time');

var _time2 = _interopRequireDefault(_time);

var _cryptography = require('../components/cryptography');

var _cryptography2 = _interopRequireDefault(_cryptography);

var _config = require('../components/config');

var _config2 = _interopRequireDefault(_config);

var _listener_manager = require('../components/listener_manager');

var _listener_manager2 = _interopRequireDefault(_listener_manager);

var _reconnection_manager = require('../components/reconnection_manager');

var _reconnection_manager2 = _interopRequireDefault(_reconnection_manager);

var _utils = require('../utils');

var _utils2 = _interopRequireDefault(_utils);

var _flow_interfaces = require('../flow_interfaces');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _class = function () {
  function _class(_ref) {
    var _this = this;

    var subscribeEndpoints = _ref.subscribeEndpoints;
    var presenceEndpoints = _ref.presenceEndpoints;
    var timeEndpoints = _ref.timeEndpoints;
    var config = _ref.config;
    var crypto = _ref.crypto;
    var listenerManager = _ref.listenerManager;

    _classCallCheck(this, _class);

    this._listenerManager = listenerManager;
    this._config = config;
    this._subscribeEndpoints = subscribeEndpoints;
    this._presenceEndpoints = presenceEndpoints;
    this._timeEndpoints = timeEndpoints;
    this._crypto = crypto;

    this._channels = {};
    this._presenceChannels = {};

    this._channelGroups = {};
    this._presenceChannelGroups = {};

    this._timetoken = 0;

    this._reconnectionManager = new _reconnection_manager2.default({ timeEndpoints: timeEndpoints });
    this._reconnectionManager.onReconnection(function () {
      _this.reconnect();
    });
  }

  _createClass(_class, [{
    key: 'adaptStateChange',
    value: function adaptStateChange(args, callback) {
      var _this2 = this;

      var state = args.state;
      var _args$channels = args.channels;
      var channels = _args$channels === undefined ? [] : _args$channels;
      var _args$channelGroups = args.channelGroups;
      var channelGroups = _args$channelGroups === undefined ? [] : _args$channelGroups;


      channels.forEach(function (channel) {
        if (channel in _this2._channels) _this2._channels[channel].state = state;
      });

      channelGroups.forEach(function (channelGroup) {
        if (channelGroup in _this2._channelGroups) _this2._channelGroups[channelGroup].state = state;
      });

      this._presenceEndpoints.setState({ state: state, channels: channels, channelGroups: channelGroups }, callback);
    }
  }, {
    key: 'adaptSubscribeChange',
    value: function adaptSubscribeChange(args) {
      var _this3 = this;

      var timetoken = args.timetoken;
      var _args$channels2 = args.channels;
      var channels = _args$channels2 === undefined ? [] : _args$channels2;
      var _args$channelGroups2 = args.channelGroups;
      var channelGroups = _args$channelGroups2 === undefined ? [] : _args$channelGroups2;
      var _args$withPresence = args.withPresence;
      var withPresence = _args$withPresence === undefined ? false : _args$withPresence;


      if (timetoken) this._timetoken = timetoken;

      channels.forEach(function (channel) {
        _this3._channels[channel] = { state: {} };
        if (withPresence) _this3._presenceChannels[channel] = {};
      });

      channelGroups.forEach(function (channelGroup) {
        _this3._channelGroups[channelGroup] = { state: {} };
        if (withPresence) _this3._presenceChannelGroups[channelGroup] = {};
      });

      this.reconnect();
    }
  }, {
    key: 'adaptUnsubscribeChange',
    value: function adaptUnsubscribeChange(args) {
      var _this4 = this;

      var _args$channels3 = args.channels;
      var channels = _args$channels3 === undefined ? [] : _args$channels3;
      var _args$channelGroups3 = args.channelGroups;
      var channelGroups = _args$channelGroups3 === undefined ? [] : _args$channelGroups3;


      channels.forEach(function (channel) {
        if (channel in _this4._channels) delete _this4._channels[channel];
        if (channel in _this4._presenceChannels) delete _this4._presenceChannels[channel];
      });

      channelGroups.forEach(function (channelGroup) {
        if (channelGroup in _this4._channelGroups) delete _this4._channelGroups[channelGroup];
        if (channelGroup in _this4._presenceChannelGroups) delete _this4._channelGroups[channelGroup];
      });

      if (this._config.suppressLeaveEvents === false) {
        this._presenceEndpoints.leave({ channels: channels, channelGroups: channelGroups }, function (status) {
          _this4._listenerManager.announceStatus(status);
        });
      }

      this.reconnect();
    }
  }, {
    key: 'reconnect',
    value: function reconnect() {
      this._startSubscribeLoop();
      this._registerHeartbeatTimer();
    }
  }, {
    key: 'disconnect',
    value: function disconnect() {
      this._stopSubscribeLoop();
      this._stopHeartbeatTimer();
    }
  }, {
    key: '_registerHeartbeatTimer',
    value: function _registerHeartbeatTimer() {
      this._stopHeartbeatTimer();
      this._heartbeatTimer = setInterval(this._performHeartbeatLoop.bind(this), this._config.getHeartbeatInterval() * 1000);
    }
  }, {
    key: '_stopHeartbeatTimer',
    value: function _stopHeartbeatTimer() {
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
      }
    }
  }, {
    key: '_performHeartbeatLoop',
    value: function _performHeartbeatLoop() {
      var _this5 = this;

      var presenceChannels = Object.keys(this._channels);
      var presenceChannelGroups = Object.keys(this._channelGroups);
      var presenceState = {};

      if (presenceChannels.length === 0 && presenceChannelGroups.length === 0) {
        return;
      }

      presenceChannels.forEach(function (channel) {
        var channelState = _this5._channels[channel].state;
        if (channelState) presenceState[channel] = channelState;
      });

      presenceChannelGroups.forEach(function (channelGroup) {
        var channelGroupState = _this5.channelGroup[channelGroup].state;
        if (channelGroupState) presenceState[channelGroup] = channelGroupState;
      });

      var onHeartbeat = function onHeartbeat(status) {
        if (status.error && _this5._config.announceFailedHeartbeats) {
          _this5._listenerManager.announceStatus(status);
        }

        if (!status.error && _this5._config.announceSuccessfulHeartbeats) {
          _this5._listenerManager.announceStatus(status);
        }
      };

      this._presenceEndpoints.heartbeat({
        channels: presenceChannels,
        channelGroups: presenceChannelGroups,
        state: presenceState }, onHeartbeat.bind(this));
    }
  }, {
    key: '_startSubscribeLoop',
    value: function _startSubscribeLoop() {
      this._stopSubscribeLoop();
      var channels = [];
      var channelGroups = [];

      Object.keys(this._channels).forEach(function (channel) {
        return channels.push(channel);
      });
      Object.keys(this._presenceChannels).forEach(function (channel) {
        return channels.push(channel + '-pnpres');
      });

      Object.keys(this._channelGroups).forEach(function (channelGroup) {
        return channelGroups.push(channelGroup);
      });
      Object.keys(this._presenceChannelGroups).forEach(function (channelGroup) {
        return channelGroups.push(channelGroup + '-pnpres');
      });

      if (channels.length === 0 && channelGroups.length === 0) {
        return;
      }

      var subscribeArgs = {
        channels: channels,
        channelGroups: channelGroups,
        timetoken: this._timetoken,
        filterExpression: this._config.filterExpression,
        region: this._region
      };

      this._subscribeCall = this._subscribeEndpoints.subscribe(subscribeArgs, this._processSubscribeResponse.bind(this));
    }
  }, {
    key: '_processSubscribeResponse',
    value: function _processSubscribeResponse(status, payload) {
      var _this6 = this;

      if (status.error) {
        if (status.category === 'PNTimeoutCategory') {
          this._startSubscribeLoop();
        }

        if (status.category === 'PNNetworkIssuesCategory') {
          this.disconnect();
          this._reconnectionManager.startPolling();
        }

        return;
      }

      payload.messages.forEach(function (message) {
        var channel = message.channel;
        var subscriptionMatch = message.subscriptionMatch;
        var publishMetaData = message.publishMetaData;

        if (channel === subscriptionMatch) {
          subscriptionMatch = null;
        }

        if (_utils2.default.endsWith(message.channel, '-pnpres')) {
          var announce = {};
          announce.actualChannel = subscriptionMatch != null ? channel : null;
          announce.subscribedChannel = subscriptionMatch != null ? subscriptionMatch : channel;

          announce.timetoken = publishMetaData.publishTimetoken;
          announce.occupancy = message.payload.occupancy;
          announce.uuid = message.payload.uuid;
          announce.timestamp = message.payload.timestamp;
          _this6._listenerManager.announcePresence(announce);
        } else {
          var _announce = {};
          _announce.actualChannel = subscriptionMatch != null ? channel : null;
          _announce.subscribedChannel = subscriptionMatch != null ? subscriptionMatch : channel;
          _announce.timetoken = publishMetaData.publishTimetoken;

          if (_this6._config.cipherKey) {
            _announce.message = _this6._crypto.decrypt(message.payload);
          } else {
            _announce.message = message.payload;
          }

          _this6._listenerManager.announceMessage(_announce);
        }
      });

      this._region = payload.metadata.region;
      this._timetoken = payload.metadata.timetoken;
      this._startSubscribeLoop();
    }
  }, {
    key: '_stopSubscribeLoop',
    value: function _stopSubscribeLoop() {
      if (this._subscribeCall) {
        this._subscribeCall.abort();
        this._subscribeCall = null;
      }
    }
  }]);

  return _class;
}();

exports.default = _class;
module.exports = exports['default'];
//# sourceMappingURL=subscription_manager.js.map