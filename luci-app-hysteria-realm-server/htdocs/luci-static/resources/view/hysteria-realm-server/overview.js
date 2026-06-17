'use strict';
'require view';
'require rpc';
'require uci';
'require ui';
'require poll';
'require dom';

var callStatus = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'status',
	expect: {}
});

var callService = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'service',
	params: [ 'action' ],
	expect: {}
});

var callInstall = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'install',
	params: [ 'url', 'version' ],
	expect: {}
});

var callIpaddr = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'ipaddr',
	expect: {}
});

var callMape = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'mape',
	expect: {}
});

// RFC 7597 GMA: a port is [ i (a bits) ][ PSID (k bits) ][ j (m bits) ], with
// m = 16 - a - k. Block index i = 1 .. 2^a-1 (i=0 = system ports, excluded).
function mapeRanges(a, k, psid) {
	var m = 16 - a - k;
	if (a < 0 || k < 0 || m < 0 || psid < 0 || psid >= (1 << k)) return [];
	var size = 1 << m, out = [];
	for (var i = 1; i < (1 << a); i++) {
		var base = (i << (k + m)) | (psid << m);
		out.push([ base, base + size - 1 ]);
	}
	return out;
}

function portInRanges(p, ranges) {
	for (var i = 0; i < ranges.length; i++)
		if (p >= ranges[i][0] && p <= ranges[i][1]) return true;
	return false;
}

function fmtRanges(ranges) {
	return ranges.map(function(r) {
		return r[0] === r[1] ? ('' + r[0]) : (r[0] + '-' + r[1]);
	}).join(', ');
}

// Parse "8000-8015 12096-12111" -> [[8000,8015],[12096,12111]]
function parsePortsets(s) {
	if (!s) return [];
	return s.trim().split(/\s+/).filter(Boolean).map(function(t) {
		var p = t.split('-');
		return [ parseInt(p[0], 10), parseInt(p[1] != null ? p[1] : p[0], 10) ];
	}).filter(function(r) { return !isNaN(r[0]) && !isNaN(r[1]); });
}

function isPrivateV4(ip) {
	var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || '');
	if (!m) return false;
	var a = +m[1], b = +m[2];
	return a === 10 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127) ||  // CGNAT
		a === 127;
}

function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
	});
}

function badge(ok, textOk, textNo) {
	var bg = ok ? '#3fb618' : '#999';
	return '<span style="display:inline-block;padding:2px 10px;border-radius:10px;' +
		'color:#fff;font-weight:bold;background:' + bg + '">' +
		esc(ok ? textOk : textNo) + '</span>';
}

function doService(action, busyText) {
	ui.showModal(_('Please wait…'), [
		E('p', { 'class': 'spinning' }, busyText)
	]);
	return callService(action).then(function(res) {
		ui.hideModal();
		if (res && res.code === 0)
			ui.addNotification(null, E('p', _('Operation completed successfully.')), 'info');
		else
			ui.addNotification(null, E('p', (res && res.stdout) || _('Operation failed.')), 'danger');
	}).catch(function(e) {
		ui.hideModal();
		ui.addNotification(null, E('p', '' + e), 'danger');
	});
}

function doInstall() {
	ui.showModal(_('Downloading core…'), [
		E('p', { 'class': 'spinning' }, _('Detecting CPU architecture and downloading the matching binary from GitHub. This may take a minute.'))
	]);
	return callInstall('', '').then(function(res) {
		ui.hideModal();
		if (res && res.code === 0) {
			ui.addNotification(null, E('p', _('Core binary installed successfully.')), 'info');
		} else {
			ui.addNotification(null, [
				E('p', _('Failed to download the core binary (code %s).').format(res ? res.code : '?')),
				E('pre', { 'style': 'white-space:pre-wrap' }, (res && res.stdout) || '')
			], 'danger');
		}
	}).catch(function(e) {
		ui.hideModal();
		ui.addNotification(null, E('p', '' + e), 'danger');
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('hysteria-realm-server'),
			callIpaddr().catch(function() { return {}; }),
			callMape().catch(function() { return {}; })
		]);
	},

	renderMapeSection: function(mape, v4, listenPort) {
		mape = mape || {};
		var auto = parsePortsets(mape.ports || '');
		var ip4 = mape.ip4 || v4 || '';
		var nodes = [ E('h3', {}, _('MAP-E / port-restricted IPv4')) ];

		if (ip4)
			nodes.push(E('p', {}, _('Shared IPv4 address: %s').format(ip4)));

		if (auto.length) {
			nodes.push(E('p', {}, [
				E('strong', {}, _('ISP-assigned IPv4 ports (auto-detected)') + ': '),
				fmtRanges(auto)
			]));
			if (!isNaN(listenPort)) {
				if (portInRanges(listenPort, auto))
					nodes.push(E('p', { 'style': 'color:#3fb618' },
						_('The listen port %s is within your assigned ports — IPv4 inbound is OK.').format(listenPort)));
				else
					nodes.push(E('p', { 'style': 'color:#d9534f' },
						_('The listen port %s is NOT within your assigned ports; IPv4 inbound will fail. Use port %s, or use IPv6.').format(listenPort, auto[0][0])));
			}
		} else {
			nodes.push(E('p', {}, _('Could not auto-detect the assigned ports. Use the calculator below with the parameters from your ISP (defaults match JPIX v6plus: a=4, k=8).')));
		}

		// --- RFC 7597 GMA calculator ---
		var aIn = E('input', { 'type': 'number', 'class': 'cbi-input-text', 'value': '4', 'style': 'width:70px' });
		var kIn = E('input', { 'type': 'number', 'class': 'cbi-input-text', 'value': '8', 'style': 'width:70px' });
		var pIn = E('input', { 'type': 'number', 'class': 'cbi-input-text', 'placeholder': 'PSID', 'style': 'width:90px' });
		var outDiv = E('div', { 'style': 'margin-top:8px;font-family:monospace;white-space:pre-wrap' }, '');

		// Pre-derive PSID from the first auto range (assuming default a=4,k=8).
		if (auto.length) {
			var m0 = 16 - 4 - 8;
			pIn.value = '' + ((auto[0][0] >> m0) & ((1 << 8) - 1));
		}

		var calcBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': function() {
				var a = parseInt(aIn.value, 10), k = parseInt(kIn.value, 10), psid = parseInt(pIn.value, 10);
				if (isNaN(a) || isNaN(k) || isNaN(psid)) {
					outDiv.textContent = _('Enter PSID (and adjust a / k) to compute the allowed ports.');
					return;
				}
				var r = mapeRanges(a, k, psid);
				if (!r.length) {
					outDiv.textContent = _('No valid ports for these parameters.');
					return;
				}
				var txt = _('Allowed ports: %s').format(fmtRanges(r));
				if (!isNaN(listenPort)) {
					txt += '\n' + (portInRanges(listenPort, r)
						? _('Listen port %s fits these parameters.').format(listenPort)
						: _('Listen port %s does NOT fit; first allowed port is %s.').format(listenPort, r[0][0]));
				}
				outDiv.textContent = txt;
			}
		}, _('Compute'));

		nodes.push(E('div', { 'style': 'margin-top:10px' }, [
			E('strong', {}, _('Port calculator (RFC 7597 GMA)')),
			E('div', { 'style': 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px' }, [
				E('label', {}, _('Offset a')), aIn,
				E('label', {}, _('PSID length k')), kIn,
				E('label', {}, 'PSID'), pIn,
				calcBtn
			]),
			outDiv
		]));

		return E('div', { 'class': 'cbi-section' }, nodes);
	},

	renderStatus: function(st) {
		st = st || {};
		var running = !!st.running;
		var installed = !!st.installed;
		var enabled = !!st.enabled;
		var supported = !!st.supported;

		var rows = [
			[ _('Service'), badge(running, _('Running'), _('Stopped')) +
				(running && st.pid ? (' <small>PID ' + esc(st.pid) + '</small>') : '') ],
			[ _('Boot autostart'), badge(enabled, _('Enabled'), _('Disabled')) ],
			[ _('Core binary'), installed ?
				(badge(true, _('Installed'), '') + ' <small>' +
					Math.round((st.bin_size || 0) / 1024) + ' KiB</small>') :
				badge(false, '', _('Not installed')) ],
			[ _('CPU / asset'), esc(st.arch || '?') +
				(supported ? (' &rarr; ' + esc(st.asset_arch)) :
					(' <span style="color:#d9534f">' + esc(_('(unsupported CPU — set a custom URL)')) + '</span>')) ],
			[ _('Listen'), esc((st.listen_addr || '?') + ':' + (st.listen_port || '?')) +
				'  (' + (st.tls_enabled === '1' ? 'HTTPS/TLS' : 'HTTP') + ')' ]
		];

		var tbl = E('table', { 'class': 'table' });
		rows.forEach(function(r) {
			var valCell = E('td', { 'class': 'td left' });
			valCell.innerHTML = r[1];
			tbl.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%', 'style': 'font-weight:bold' }, r[0]),
				valCell
			]));
		});

		return tbl;
	},

	render: function(data) {
		var self = this;
		var token = uci.get('hysteria-realm-server', 'main', 'token') || '';
		var port = uci.get('hysteria-realm-server', 'main', 'listen_port') || '8443';
		var tls = uci.get('hysteria-realm-server', 'main', 'tls_enabled') === '1';
		var scheme = tls ? 'https' : 'http';

		// Auto-detect the address(es) clients use to reach this router.
		var ip = (data && data[1]) || {};
		var v4 = ip.wan4 || '';
		var v6 = ip.wan6 || '';
		var lan4 = ip.lan4 || '';
		var restricted = (ip.v4restricted === true || ip.v4restricted === 1 || ip.v4restricted === '1');
		var tech = ip.v4tech || '';
		var mape = (data && data[2]) || {};

		// IPv6 is preferred: no NAT, no MAP-E port limits — most reliable for a
		// rendezvous endpoint. Fall back to IPv4, then LAN, then a placeholder.
		var endpoints = [];
		if (v6) endpoints.push('[' + v6 + ']');
		if (v4) endpoints.push(v4);
		var host = endpoints.length ? endpoints[0] : (lan4 || 'YOUR_PUBLIC_IP_OR_DOMAIN');

		var hostNotes = [];
		if (restricted)
			hostNotes.push({ warn: true, text:
				_('Detected %s: inbound IPv4 on this line is port-restricted or unavailable. Use the IPv6 endpoint below. To use IPv4 you must set the listen port to one inside your ISP-assigned MAP-E port range.').format(tech || _('IPv4-over-IPv6')) });
		if (v4 && isPrivateV4(v4) && !restricted)
			hostNotes.push({ warn: true, text:
				_('The WAN IPv4 address %s is private/NAT — external clients need port forwarding, a public IP, or DDNS.').format(v4) });
		if (!v4 && !v6 && lan4)
			hostNotes.push({ warn: true, text:
				_('Only a LAN address was found (%s); use the address external clients actually reach this router by.').format(lan4) });
		if (v4 && v6)
			hostNotes.push({ warn: false, text:
				_('Dual-stack detected. For clients on either protocol, point a domain with both A and AAAA records at this router and use that as the server.') });

		var statusBox = E('div', {}, E('em', {}, _('Collecting data…')));

		poll.add(function() {
			return callStatus().then(function(st) {
				dom.content(statusBox, self.renderStatus(st));
			});
		}, 5);

		var btn = function(label, style, cb) {
			return E('button', {
				'class': 'btn cbi-button cbi-button-' + style,
				'style': 'margin:2px',
				'click': ui.createHandlerFn(this, cb)
			}, label);
		};

		var serverURL = scheme + '://' + host + ':' + port;

		var exampleServer =
			'# On the Hysteria 2 SERVER (config.yaml)\n' +
			'realm:\n' +
			'  server: ' + serverURL + '\n' +
			'  token: ' + (token || '<your-token>') + '\n' +
			'  name: my-realm';

		var exampleClient =
			'# On the Hysteria 2 CLIENT (config.yaml)\n' +
			'realm:\n' +
			'  server: ' + serverURL + '\n' +
			'  token: ' + (token || '<your-token>') + '\n' +
			'  name: my-realm';

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Hysteria Realm Server')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Rendezvous server for the Hysteria 2 P2P (Realms) feature. It coordinates UDP hole punching so you can host Hysteria servers behind NAT without a public IP or port forwarding.')),
			E('div', {
				'style': 'margin:8px 0;padding:10px 12px;border-left:4px solid #f0ad4e;background:#fcf8e3;border-radius:4px'
			}, E('strong', {}, _('Prerequisite: this rendezvous server itself must be publicly reachable. Hysteria servers and clients connect to it directly, so this router needs a public IP, or a forwarded TCP port / DDNS. It is the one component that cannot sit behind un-forwarded NAT (CGNAT will not work).'))),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Status')),
				statusBox
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Service control')),
				E('div', {}, [
					btn(_('Start'), 'apply', function() { return doService('start', _('Starting service…')); }),
					btn(_('Stop'), 'reset', function() { return doService('stop', _('Stopping service…')); }),
					btn(_('Restart'), 'neutral', function() { return doService('restart', _('Restarting service…')); }),
					E('span', { 'style': 'display:inline-block;width:16px' }),
					btn(_('Enable autostart'), 'positive', function() { return doService('enable', _('Enabling…')); }),
					btn(_('Disable autostart'), 'negative', function() { return doService('disable', _('Disabling…')); })
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Core binary')),
				E('p', {}, _('Download or update the core binary matching your router CPU, built by this project\'s GitHub Actions CI for all common OpenWrt architectures (x86_64, arm64, armv7/v5, mips/mipsel, mips64, riscv64, …).')),
				btn(_('Download / Update core'), 'action', function() { return doInstall(); })
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Connection example')),
				E('p', {}, _('The server address below is auto-filled from this router (IPv6 preferred). Paste the matching block into your Hysteria 2 config; adjust the address if clients reach you via a different IP or domain.')),
				endpoints.length ? E('p', {}, [ E('strong', {}, _('Available endpoints') + ': '), endpoints.join('   ') ]) : '',
				E('div', {}, hostNotes.map(function(n) {
					return E('p', { 'style': 'margin:4px 0;color:' + (n.warn ? '#d9534f' : '#666') }, n.text);
				})),
				E('div', { 'style': 'display:flex;gap:12px;flex-wrap:wrap' }, [
					E('div', { 'style': 'flex:1;min-width:280px' }, [
						E('strong', {}, _('Server side')),
						E('pre', { 'style': 'white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:4px' }, exampleServer)
					]),
					E('div', { 'style': 'flex:1;min-width:280px' }, [
						E('strong', {}, _('Client side')),
						E('pre', { 'style': 'white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:4px' }, exampleClient)
					])
				]),
				token ? '' : E('p', { 'style': 'color:#d9534f' },
					_('No token is set yet. Generate one in Settings before starting the service.'))
			]),

			(restricted || (mape.ports && mape.ports.trim()))
				? self.renderMapeSection(mape, v4, parseInt(port, 10)) : ''
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
