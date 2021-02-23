/**
 * analytics.js - Provides an abstraction over code that calls Google Analytics
 * for user tracking. Attaches to router:navigation:success event to track when
 * a page has been loaded. Registers a click event handler for elements that are defined
 * in the filter function to track clicks.
 */

'use strict';

import {
	inject
} from 'aurelia-dependency-injection';
import {
	EventAggregator
} from 'aurelia-event-aggregator';
import * as LogManager from 'aurelia-logging';
import deepmerge from 'deepmerge';

/*
.plugin('aurelia-google-analytics', config => {
			config.attach({
				customTracking: {
					useNativeGaScript: true
				},
				logging: {
					enabled: true
				},
				pageTracking: {
					enabled: true,
					ignore: {
						fragments: [],
						routes: [],
						routeNames: []
					},
					getTitle: function(payload) {
						return payload.instruction.config.title;
					},
					getUrl: payload => {
						return payload.instruction.fragment;
					}
				},
				clickTracking: {
					enabled: true,
					filter: (element) => {
						return element instanceof HTMLElement &&
						(element.nodeName.toLowerCase() === 'a' ||
							element.nodeName.toLowerCase() === 'button');
					}
				}
			});
			config.init('<Tracker ID here>');
		})
*/

const criteria = {
	isElement: function (e) {
		return e instanceof HTMLElement;
	},
	hasClass: function (cls) {
		return function (e) {
			return criteria.isElement(e) && e.classList.contains(cls);
		}
	},
	hasTrackingInfo: function (e) {
		return criteria.isElement(e) &&
			e.hasAttribute('data-analytics-category') &&
			e.hasAttribute('data-analytics-action');
	},
	isOfType: function (e, type) {
		return criteria.isElement(e) && e.nodeName.toLowerCase() === type.toLowerCase();
	},
	isAnchor: function (e) {
		return criteria.isOfType(e, 'a');
	},
	isButton: function (e) {
		return criteria.isOfType(e, 'button');
	}
};

const defaultOptions = {
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
		getTitle: (payload) => {
			return payload.instruction.config.title;
		},
		getUrl: (payload) => {
			return payload.instruction.fragment;
		},
		customFnTrack: false,
	},
	clickTracking: {
		enabled: false,
		filter: (element) => {
			return criteria.isAnchor(element) || criteria.isButton(element);
		},
		customFnTrack: false,
	},
	exceptionTracking: {
		enabled: true,
		applicationName: undefined,
		applicationVersion: undefined,
		customFnTrack: false,
	}
};

const delegate = function (criteria, listener) {
	return function (evt) {
		let el = evt.target;
		do {
			if (criteria && !criteria(el))
				continue;
			evt.delegateTarget = el;
			listener.apply(this, arguments);
			return;
		} while ((el = el.parentNode));
	};
};

@inject(EventAggregator)
export class Analytics {
	constructor(eventAggregator) {
		this._eventAggregator = eventAggregator;
		this._initialized = false;
		this._logger = LogManager.getLogger('analytics-plugin');
		this._options = defaultOptions;

		this._trackClick = this._trackClick.bind(this);
		this._trackPage = this._trackPage.bind(this);
	}

	attach(options = defaultOptions) {
		this._options = deepmerge(defaultOptions, options);

		if (!this._options.useNativeGaScript) {
			this._initialized = true;
		}
		
		if (!this._initialized) {
			const errorMessage = "Analytics must be initialized before use.";
			this._log('error', errorMessage);
			throw new Error(errorMessage);
		}

		this._attachClickTracker();
		this._attachPageTracker();
		this._attachExceptionTracker();
	}

	init(id) {
		if (!this._options.useNativeGaScript) {
			return;
		}

		const script = document.createElement('script');
		script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
		document.querySelector('body').appendChild(script);


		this._initFnGa();
		gtag('js', new Date());
		this._sendFnGa('config', id, { 'send_page_view': false });

		this._initialized = true;
	}

	_initFnGa() {
		window.dataLayer = window.dataLayer || [];

		window.gtag = window.gtag || function () {
			dataLayer.push(arguments)
		};
	}

	_sendFnGa() {
		this._initFnGa();
		window.gtag.apply(window.gtag, arguments);
	}

	_attachClickTracker() {
		if (!this._options.clickTracking.enabled) {
			return;
		}

		document.querySelector('body')
			.addEventListener('click', delegate(this._options.clickTracking.filter, this._trackClick));
	}

	_attachPageTracker() {
		if (!this._options.pageTracking.enabled) {
			return;
		}

		this._eventAggregator.subscribe('router:navigation:success',
			payload => {
				if (
					// Ignore page fragments
					this._options.pageTracking.ignore.fragments.some((fragment) => payload.instruction.fragment.includes(fragment))
					// Ignore routes
					|| this._options.pageTracking.ignore.routes.some((route) => payload.instruction.config.route === route)
					// Ignore route names
					|| this._options.pageTracking.ignore.routeNames.some((routeName) => payload.instruction.config.name === routeName)
					)
					return;

				this._trackPage(this._options.pageTracking.getUrl(payload), this._options.pageTracking.getTitle(payload))
			});
	}

	_attachExceptionTracker() {
		if (!this._options.exceptionTracking.enabled) {
			return;
		}

		let options = this._options;
		let existingWindowErrorCallback = window.onerror;

		window.onerror = function (errorMessage, url, lineNumber, columnNumber, errorObject) {
			// Send error details to Google Analytics, if library has loaded.
			if (typeof ga === 'function') {
				let exceptionDescription;
				if (errorObject != undefined && typeof errorObject.message != undefined) {
					exceptionDescription = errorObject.message;
				} else {
					exceptionDescription = errorMessage;
				}

				exceptionDescription += " @ " + url;
				// Include additional details if available.
				if (lineNumber != undefined && columnNumber != undefined) {
					exceptionDescription += ":" + lineNumber + ":" + columnNumber;
				}

				let exOptions = {
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

			// Otherwise continue with the error.
			return false;
		};
	}

	_log(level, message) {
		if (!this._options.logging.enabled) {
			return;
		}

		this._logger[level](message);
	}

	_trackClick(evt) {
		if (!this._initialized) {
			this._log('warn', "The component has not been initialized. Please call 'init()' before calling 'attach()'.");
			return;
		}
		if (!evt || !evt.delegateTarget || !criteria.hasTrackingInfo(evt.delegateTarget)) {
			return
		};

		const element = evt.delegateTarget;
		const tracking = {
			category: element.getAttribute('data-analytics-category'),
			action: element.getAttribute('data-analytics-action'),
			label: element.getAttribute('data-analytics-label'),
			value: element.getAttribute('data-analytics-value')
		};

		this._log('debug', `click: category '${tracking.category}', action '${tracking.action}', label '${tracking.label}', value '${tracking.value}'`);
		if (this._options.clickTracking.customFnTrack) {
			return this._options.clickTracking.customFnTrack(tracking);
		}

		this._sendFnGa('event', 'click', tracking);
	}

	_trackPage(path, title) {
		this._log('debug', `Tracking path = ${path}, title = ${title}`);
		if (!this._initialized) {
			this._log('warn', "Try calling 'init()' before calling 'attach()'.");
			return;
		}

		const props = {
			page: path,
			title: title,
			anonymizeIp: this._options.anonymizeIp.enabled
		};

		if (this._options.pageTracking.customFnTrack) {
			return this._options.pageTracking.customFnTrack(props);
		}

		this._sendFnGa('set', props);
		this._sendFnGa('event', 'page_view', props);
	}
}
