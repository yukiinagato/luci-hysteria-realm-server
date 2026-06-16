'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var callGenToken = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'gen_token',
	expect: { token: '' }
});

// A text field with an attached "Generate" button that fills a random token.
var TokenValue = form.Value.extend({
	renderWidget: function(section_id, option_index, cfgvalue) {
		var node = form.Value.prototype.renderWidget.apply(this, arguments);
		var btn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(this, function() {
				return callGenToken().then(function(tok) {
					if (!tok) {
						ui.addNotification(null, E('p', _('Failed to generate a token.')), 'danger');
						return;
					}
					var input = node.querySelector('input');
					if (input) {
						input.value = tok;
						input.dispatchEvent(new Event('input'));
						input.dispatchEvent(new Event('change'));
					}
					ui.addNotification(null, E('p', _('A new random token was generated. Remember to Save & Apply.')), 'info');
				});
			})
		}, _('Generate'));
		return E('div', { 'style': 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [ node, btn ]);
	}
});

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('hysteria-realm-server', _('Hysteria Realm Server — Settings'),
			_('Configure the rendezvous server. Changes take effect after Save & Apply (the service restarts automatically).'));

		s = m.section(form.NamedSection, 'main', 'hysteria-realm-server');
		s.anonymous = true;
		s.addremove = false;

		s.tab('general', _('General'));
		s.tab('limits', _('Limits'));
		s.tab('advanced', _('Advanced'));

		// --- General ---
		o = s.taboption('general', form.Flag, 'enabled', _('Enabled'),
			_('Master switch for the service.'));
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'listen_addr', _('Listen address'),
			_('Bind address. Use 0.0.0.0 for all interfaces.'));
		o.datatype = 'ipaddr';
		o.placeholder = '0.0.0.0';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'listen_port', _('Listen port'),
			_('TCP port for the HTTP/HTTPS rendezvous API.'));
		o.datatype = 'port';
		o.placeholder = '8443';
		o.rmempty = false;

		o = s.taboption('general', TokenValue, 'token', _('Shared token'),
			_('Bearer token required for realm registration and connection. Both the Hysteria server and clients must use the same value. REQUIRED.'));
		o.password = true;
		o.rmempty = false;

		o = s.taboption('general', form.Flag, 'open_firewall', _('Auto-open firewall'),
			_('Automatically add an input ACCEPT rule on the WAN zone for the listen port. Disable if you manage the firewall manually.'));
		o.default = '1';
		o.rmempty = false;

		// --- Limits ---
		o = s.taboption('limits', form.Value, 'max_realms', _('Max realms'),
			_('Maximum total number of registered realms. 0 disables the limit.'));
		o.datatype = 'uinteger';
		o.placeholder = '65536';

		o = s.taboption('limits', form.Value, 'max_realms_per_ip', _('Max realms per IP'),
			_('Maximum realms per client IP. 0 disables the limit.'));
		o.datatype = 'uinteger';
		o.placeholder = '4';

		// --- Advanced ---
		o = s.taboption('advanced', form.Flag, 'debug', _('Debug logging'),
			_('Enable verbose logs for registration, sessions and punches.'));

		o = s.taboption('advanced', form.Value, 'trusted_proxy_header', _('Trusted proxy header'),
			_('Header to read the real client IP from when behind a trusted reverse proxy/CDN (e.g. X-Forwarded-For, CF-Connecting-IP). Leave empty if not proxied — enabling it on a directly-exposed server lets clients spoof their IP.'));
		o.placeholder = 'X-Forwarded-For';

		o = s.taboption('advanced', form.Value, 'realm_name_pattern', _('Realm name pattern'),
			_('Regular expression that realm names must match.'));
		o.placeholder = '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$';

		o = s.taboption('advanced', form.Value, 'version', _('Core version'),
			_('Upstream release version to download (e.g. 1.0.1). Must match a tag published by the release repository.'));
		o.placeholder = '1.0.1';

		o = s.taboption('advanced', form.Value, 'release_repo', _('Release repository'),
			_('GitHub repository (owner/name) that hosts the CI-built per-architecture binaries.'));
		o.placeholder = 'yukiinagato/luci-hysteria-realm-server';

		o = s.taboption('advanced', form.Value, 'download_url', _('Custom download URL'),
			_('Override the full binary download URL (highest priority). Use it only for CPUs without a published binary — point it to a self-compiled binary. Leave empty for auto-detection.'));
		o.placeholder = 'https://…/hysteria-realm-server';

		return m.render();
	}
});
