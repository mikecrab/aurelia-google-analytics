define(['exports', 'aurelia-dependency-injection', 'aurelia-event-aggregator', 'aurelia-logging', 'deepmerge'], function (exports, _aureliaDependencyInjection, _aureliaEventAggregator, _aureliaLogging, _deepmerge) {

	'use strict';

	Object.defineProperty(exports, "__esModule", {
		value: true
	});
	exports.Analytics = undefined;

	var LogManager = _interopRequireWildcard(_aureliaLogging);

	var _deepmerge2 = _interopRequireDefault(_deepmerge);

	function _interopRequireDefault(obj) {
		return obj && obj.__esModule ? obj : {
			default: obj
		};
	}

	function _interopRequireWildcard(obj) {
		if (obj && obj.__esModule) {
			return obj;
		} else {
			var newObj = {};

			if (obj != null) {
				for (var key in obj) {
					if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key];
				}
			}

			newObj.default = obj;
			return newObj;
		}
	}

	var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
		return typeof obj;
	} : function (obj) {
		return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
	};

	function _classCallCheck(instance, Constructor) {
		if (!(instance instanceof Constructor)) {
			throw new TypeError("Cannot call a class as a function");
		}
	}

	var _dec, _class;

	var criteria = {
		isElement: function isElement(e) {
			return e instanceof HTMLElement;
		},
		hasClass: function hasClass(cls) {
			return function (e) {
				return criteria.isElement(e) && e.classList.contains(cls);
			};
		},
		hasTrackingInfo: function hasTrackingInfo(e) {
			return criteria.isElement(e) && e.hasAttribute('data-analytics-category') && e.hasAttribute('data-analytics-action');
		},
		isOfType: function isOfType(e, type) {
			return criteria.isElement(e) && e.nodeName.toLowerCase() === type.toLowerCase();
		},
		isAnchor: function isAnchor(e) {
			return criteria.isOfType(e, 'a');
		},
		isButton: function isButton(e) {
			return criteria.isOfType(e, 'button');
		}
	};

	var defaultOptions = {
		useNativeGaScript: true,
		logging: {
			enabled: true
		},
		anonymizeIp: {
			enabled: false
		},
		pageTracking: {
			enabled: false,
			ignore: {
				fragments: [],
				routes: [],
				routeNames: []
			},
			getTitle: function getTitle(payload) {
				return payload.instruction.config.title;
			},
			getUrl: function getUrl(payload) {
				return payload.instruction.fragment;
			},
			customFnTrack: false
		},
		clickTracking: {
			enabled: false,
			filter: function filter(element) {
				return criteria.isAnchor(element) || criteria.isButton(element);
			},
			customFnTrack: false
		},
		exceptionTracking: {
			enabled: true,
			applicationName: undefined,
			applicationVersion: undefined,
			customFnTrack: false
		}
	};

	var delegate = function delegate(criteria, listener) {
		return function (evt) {
			var el = evt.target;
			do {
				if (criteria && !criteria(el)) continue;
				evt.delegateTarget = el;
				listener.apply(this, arguments);
				return;
			} while (el = el.parentNode);
		};
	};

	var Analytics = exports.Analytics = (_dec = (0, _aureliaDependencyInjection.inject)(_aureliaEventAggregator.EventAggregator), _dec(_class = function () {
		function Analytics(eventAggregator) {
			_classCallCheck(this, Analytics);

			this._eventAggregator = eventAggregator;
			this._initialized = false;
			this._logger = LogManager.getLogger('analytics-plugin');
			this._options = defaultOptions;

			this._trackClick = this._trackClick.bind(this);
			this._trackPage = this._trackPage.bind(this);
		}

		Analytics.prototype.attach = function attach() {
			var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : defaultOptions;

			this._options = (0, _deepmerge2.default)(defaultOptions, options);

			if (!this._options.useNativeGaScript) {
				this._initialized = true;
			}

			if (!this._initialized) {
				var errorMessage = "Analytics must be initialized before use.";
				this._log('error', errorMessage);
				throw new Error(errorMessage);
			}

			this._attachClickTracker();
			this._attachPageTracker();
			this._attachExceptionTracker();
		};

		Analytics.prototype.init = function init(id) {
			if (!this._options.useNativeGaScript) {
				return;
			}

			var script = document.createElement('script');
			script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
			document.querySelector('body').appendChild(script);

			this._initFnGa();
			gtag('js', new Date());
			this._sendFnGa('config', id, { 'send_page_view': false });

			this._initialized = true;
		};

		Analytics.prototype._initFnGa = function _initFnGa() {
			window.dataLayer = window.dataLayer || [];

			window.gtag = window.gtag || function () {
				dataLayer.push(arguments);
			};
		};

		Analytics.prototype._sendFnGa = function _sendFnGa() {
			this._initFnGa();
			window.gtag.apply(window.gtag, arguments);
		};

		Analytics.prototype._attachClickTracker = function _attachClickTracker() {
			if (!this._options.clickTracking.enabled) {
				return;
			}

			document.querySelector('body').addEventListener('click', delegate(this._options.clickTracking.filter, this._trackClick));
		};

		Analytics.prototype._attachPageTracker = function _attachPageTracker() {
			var _this = this;

			if (!this._options.pageTracking.enabled) {
				return;
			}

			this._eventAggregator.subscribe('router:navigation:success', function (payload) {
				if (_this._options.pageTracking.ignore.fragments.some(function (fragment) {
					return payload.instruction.fragment.includes(fragment);
				}) || _this._options.pageTracking.ignore.routes.some(function (route) {
					return payload.instruction.config.route === route;
				}) || _this._options.pageTracking.ignore.routeNames.some(function (routeName) {
					return payload.instruction.config.name === routeName;
				})) return;

				_this._trackPage(_this._options.pageTracking.getUrl(payload), _this._options.pageTracking.getTitle(payload));
			});
		};

		Analytics.prototype._attachExceptionTracker = function _attachExceptionTracker() {
			if (!this._options.exceptionTracking.enabled) {
				return;
			}

			var options = this._options;
			var existingWindowErrorCallback = window.onerror;

			window.onerror = function (errorMessage, url, lineNumber, columnNumber, errorObject) {
				if (typeof ga === 'function') {
					var exceptionDescription = void 0;
					if (errorObject != undefined && _typeof(errorObject.message) != undefined) {
						exceptionDescription = errorObject.message;
					} else {
						exceptionDescription = errorMessage;
					}

					exceptionDescription += " @ " + url;

					if (lineNumber != undefined && columnNumber != undefined) {
						exceptionDescription += ":" + lineNumber + ":" + columnNumber;
					}

					var exOptions = {
						exDescription: exceptionDescription,
						exFatal: false
					};

					if (options.exceptionTracking.applicationName != undefined) {
						exOptions.appName = options.exceptionTracking.applicationName;
					}
					if (options.exceptionTracking.applicationVersion != undefined) {
						exOptions.appVersion = options.exceptionTracking.applicationVersion;
					}

					if (options.exceptionTracking.customFnTrack) {
						return options.exceptionTracking.customFnTrack(exOptions);
					}
					this._sendFnGa('event', 'app_exception', exOptions);
				}

				if (typeof existingWindowErrorCallback === 'function') {
					return existingWindowErrorCallback(errorMessage, url, lineNumber, columnNumber, errorObject);
				}

				return false;
			};
		};

		Analytics.prototype._log = function _log(level, message) {
			if (!this._options.logging.enabled) {
				return;
			}

			this._logger[level](message);
		};

		Analytics.prototype._trackClick = function _trackClick(evt) {
			if (!this._initialized) {
				this._log('warn', "The component has not been initialized. Please call 'init()' before calling 'attach()'.");
				return;
			}
			if (!evt || !evt.delegateTarget || !criteria.hasTrackingInfo(evt.delegateTarget)) {
				return;
			};

			var element = evt.delegateTarget;
			var tracking = {
				category: element.getAttribute('data-analytics-category'),
				action: element.getAttribute('data-analytics-action'),
				label: element.getAttribute('data-analytics-label'),
				value: element.getAttribute('data-analytics-value')
			};

			this._log('debug', 'click: category \'' + tracking.category + '\', action \'' + tracking.action + '\', label \'' + tracking.label + '\', value \'' + tracking.value + '\'');
			if (this._options.clickTracking.customFnTrack) {
				return this._options.clickTracking.customFnTrack(tracking);
			}

			this._sendFnGa('send', 'click', tracking);
		};

		Analytics.prototype._trackPage = function _trackPage(path, title) {
			this._log('debug', 'Tracking path = ' + path + ', title = ' + title);
			if (!this._initialized) {
				this._log('warn', "Try calling 'init()' before calling 'attach()'.");
				return;
			}

			var props = {
				page: path,
				title: title,
				anonymizeIp: this._options.anonymizeIp.enabled
			};

			if (this._options.pageTracking.customFnTrack) {
				return this._options.pageTracking.customFnTrack(props);
			}

			this._sendFnGa('set', props);
			this._sendFnGa('event', 'page_view', props);
		};

		return Analytics;
	}()) || _class);
});