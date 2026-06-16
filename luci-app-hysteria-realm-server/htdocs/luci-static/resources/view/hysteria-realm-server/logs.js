'use strict';
'require view';
'require rpc';
'require poll';
'require ui';

var callLogs = rpc.declare({
	object: 'luci.hysteria-realm-server',
	method: 'logs',
	params: [ 'lines' ],
	expect: { log: '' }
});

return view.extend({
	render: function() {
		var area = E('textarea', {
			'readonly': 'readonly',
			'wrap': 'off',
			'style': 'width:100%;height:60vh;font-family:monospace;font-size:12px;white-space:pre'
		}, '');

		var autoScroll = true;

		function refresh() {
			return callLogs(300).then(function(txt) {
				area.value = txt || _('(no log entries yet — start the service to produce logs)');
				if (autoScroll)
					area.scrollTop = area.scrollHeight;
			});
		}

		poll.add(refresh, 5);

		var scrollChk = E('input', { 'type': 'checkbox', 'checked': 'checked' });
		scrollChk.addEventListener('change', function() { autoScroll = scrollChk.checked; });

		var refreshBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(this, function() { return refresh(); })
		}, _('Refresh now'));

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Service logs')),
			E('p', { 'class': 'cbi-map-descr' },
				_('Live output captured from the service via the system log (logread). Updates every 5 seconds.')),
			E('div', { 'style': 'margin-bottom:8px;display:flex;gap:12px;align-items:center' }, [
				refreshBtn,
				E('label', {}, [ scrollChk, ' ', _('Auto-scroll to bottom') ])
			]),
			area
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
