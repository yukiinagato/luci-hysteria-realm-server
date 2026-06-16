'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require ui';

var callGenCert = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'gen_cert',
	params: [ 'cn', 'days' ],
	expect: {}
});

return view.extend({
	load: function() {
		return uci.load('hysteria-realm-server');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('hysteria-realm-server', _('TLS Certificate'),
			_('Serve the rendezvous API over HTTPS. When TLS is disabled the server runs plain HTTP — fine behind another TLS-terminating proxy, but not recommended for direct exposure.'));

		s = m.section(form.NamedSection, 'main', 'hysteria-realm-server');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'tls_enabled', _('Enable TLS'),
			_('Use the certificate and key below. The service falls back to HTTP if either file is missing.'));

		o = s.option(form.Value, 'cert_path', _('Certificate path'));
		o.placeholder = '/etc/hysteria-realm-server/cert.pem';
		o.depends('tls_enabled', '1');

		o = s.option(form.Value, 'key_path', _('Private key path'));
		o.placeholder = '/etc/hysteria-realm-server/key.pem';
		o.depends('tls_enabled', '1');

		return m.render().then(function(mapEl) {
			var cnInput = E('input', {
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': 'router.lan',
				'style': 'width:220px'
			});
			var daysInput = E('input', {
				'type': 'number',
				'class': 'cbi-input-text',
				'value': '3650',
				'style': 'width:120px'
			});

			var genBtn = E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(this, function() {
					ui.showModal(_('Generating certificate…'), [
						E('p', { 'class': 'spinning' }, _('Creating a self-signed ECDSA certificate…'))
					]);
					return callGenCert(cnInput.value || 'router.lan', parseInt(daysInput.value || '3650', 10))
						.then(function(res) {
							ui.hideModal();
							if (res && res.code === 0) {
								ui.addNotification(null, E('p',
									_('Certificate generated at %s. Enable TLS above, then Save & Apply.').format(res.cert)), 'info');
							} else {
								ui.addNotification(null, [
									E('p', _('Certificate generation failed.')),
									E('pre', { 'style': 'white-space:pre-wrap' }, (res && res.stdout) || '')
								], 'danger');
							}
						}).catch(function(e) {
							ui.hideModal();
							ui.addNotification(null, E('p', '' + e), 'danger');
						});
				})
			}, _('Generate self-signed certificate'));

			var panel = E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Quick self-signed certificate')),
				E('p', {}, _('Generates a certificate/key pair at the configured paths. Self-signed certificates require clients to disable certificate verification (insecure: true in the Hysteria realm config).')),
				E('div', { 'style': 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' }, [
					E('label', {}, _('Common name (CN)')), cnInput,
					E('label', {}, _('Valid days')), daysInput,
					genBtn
				])
			]);

			return E('div', {}, [ mapEl, panel ]);
		});
	}
});
