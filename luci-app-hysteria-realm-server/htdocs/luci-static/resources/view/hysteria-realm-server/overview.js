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
			uci.load('hysteria-realm-server')
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
		var addr = uci.get('hysteria-realm-server', 'main', 'listen_addr') || '0.0.0.0';
		var port = uci.get('hysteria-realm-server', 'main', 'listen_port') || '8443';
		var tls = uci.get('hysteria-realm-server', 'main', 'tls_enabled') === '1';
		var scheme = tls ? 'https' : 'http';

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

		var exampleServer =
			'# On the Hysteria 2 SERVER (config.yaml)\n' +
			'realm:\n' +
			'  server: ' + scheme + '://YOUR_PUBLIC_IP_OR_DOMAIN:' + port + '\n' +
			'  token: ' + (token || '<your-token>') + '\n' +
			'  name: my-realm';

		var exampleClient =
			'# On the Hysteria 2 CLIENT (config.yaml)\n' +
			'realm:\n' +
			'  server: ' + scheme + '://YOUR_PUBLIC_IP_OR_DOMAIN:' + port + '\n' +
			'  token: ' + (token || '<your-token>') + '\n' +
			'  name: my-realm';

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Hysteria Realm Server')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Rendezvous server for the Hysteria 2 P2P (Realms) feature. It coordinates UDP hole punching so you can host Hysteria servers behind NAT without a public IP or port forwarding.')),

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
				E('p', {}, _('Paste the matching block into your Hysteria 2 config. Replace the public IP/domain with how clients reach this router.')),
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
