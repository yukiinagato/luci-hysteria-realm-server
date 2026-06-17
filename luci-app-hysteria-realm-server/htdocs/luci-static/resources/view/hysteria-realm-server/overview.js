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
			callIpaddr().catch(function() { return {}; })
		]);
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

		// Auto-detect the address clients use to reach this router.
		var ip = (data && data[1]) || {};
		var host, hostNote = '';
		if (ip.wan4) {
			host = ip.wan4;
			if (isPrivateV4(ip.wan4))
				hostNote = _('The WAN address %s is private/NAT — external clients need port forwarding, a public IP, or DDNS.').format(ip.wan4);
		} else if (ip.wan6) {
			host = '[' + ip.wan6 + ']';
		} else if (ip.lan4) {
			host = ip.lan4;
			hostNote = _('Only a LAN address was found (%s); use the address external clients actually reach this router by.').format(ip.lan4);
		} else {
			host = 'YOUR_PUBLIC_IP_OR_DOMAIN';
		}

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
				E('p', {}, _('The server address below is auto-filled from this router. Paste the matching block into your Hysteria 2 config; adjust the address if clients reach you via a different IP or domain.')),
				hostNote ? E('p', { 'style': 'color:#d9534f' }, hostNote) : '',
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
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
