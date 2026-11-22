import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  fetchAppSettings,
  updateAppSettings,
} from '../src/api/settings.ts';
import {
  CONTACT,
  GENERAL_HELP,
  PASSWORD_RESET_MESSAGE,
} from '../src/content/messages.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('fetchAppSettings sends contact through from the API', async () => {
  const settings = await fetchAppSettings({
    fetcher: async (path, options) => {
      assert.equal(path, '/api/settings');
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'same-origin');
      return json({
        data: {
          organization_name: 'City of Alexandria',
          password_reset_message: '<p>Contact the help desk.</p>',
          general_help: '<p>Start with Audit Reports.</p>',
          contact: '<p>helpdesk@example.gov</p>',
        },
      });
    },
  });

  assert.deepEqual(settings, {
    organizationName: 'City of Alexandria',
    passwordResetMessage: '<p>Contact the help desk.</p>',
    generalHelp: '<p>Start with Audit Reports.</p>',
    contact: '<p>helpdesk@example.gov</p>',
  });
});

test('fetchAppSettings accepts a bare object with camelCase keys', async () => {
  const settings = await fetchAppSettings({
    fetcher: async () => json({
      organizationName: 'City of Alexandria',
      passwordResetMessage: '<p>Contact the help desk.</p>',
      generalHelp: '<p>Start with Audit Reports.</p>',
      contact: '<p>helpdesk@example.gov</p>',
    }),
  });

  assert.equal(settings.contact, '<p>helpdesk@example.gov</p>');
});

test('fetchAppSettings falls back when contact is missing or blank', async () => {
  for (const contact of [undefined, '', '   ', 42, null]) {
    const settings = await fetchAppSettings({
      fetcher: async () => json({ data: { contact } }),
    });

    assert.equal(settings.contact, CONTACT, `contact=${String(contact)}`);
  }
});

test('fetchAppSettings falls back when rich text has no visible content', async () => {
  for (const contact of ['<p></p>', '<p><br></p>', '<p>&nbsp;</p>']) {
    const settings = await fetchAppSettings({
      fetcher: async () => json({ data: { contact } }),
    });

    assert.equal(settings.contact, CONTACT, contact);
  }
});

test('fetchAppSettings keeps the formatting of a saved rich-text value', async () => {
  const stored = '<p><strong>Help desk</strong></p><ul><li>Mon–Fri</li></ul>';
  const settings = await fetchAppSettings({
    fetcher: async () => json({ data: { general_help: stored } }),
  });

  assert.equal(settings.generalHelp, stored);
});

test('fetchAppSettings converts a legacy plain-text value to HTML', async () => {
  const settings = await fetchAppSettings({
    fetcher: async () => json({
      data: {
        general_help: 'Line one\nLine two',
        contact: 'team@example.gov',
      },
    }),
  });

  assert.equal(settings.generalHelp, '<p>Line one<br>Line two</p>');
  assert.equal(settings.contact, '<p>team@example.gov</p>');
});

test('fetchAppSettings sanitizes markup stored straight in the database', async () => {
  const settings = await fetchAppSettings({
    fetcher: async () => json({
      data: { contact: '<p onmouseover="alert(1)">Hi</p><script>x</script>' },
    }),
  });

  assert.ok(!/onmouseover/i.test(settings.contact), settings.contact);
  assert.ok(!/<script/i.test(settings.contact), settings.contact);
  assert.equal(settings.contact, '<p>Hi</p>x');
});

test('fetchAppSettings trims surrounding whitespace from rich text', async () => {
  const settings = await fetchAppSettings({
    fetcher: async () => json({
      data: { contact: '  <p>help@example.gov</p>  ' },
    }),
  });

  assert.equal(settings.contact, '<p>help@example.gov</p>');
});

test('DEFAULT_SETTINGS are HTML with the expected text', () => {
  assert.equal(DEFAULT_SETTINGS.contact, CONTACT);
  assert.equal(DEFAULT_SETTINGS.generalHelp, GENERAL_HELP);
  assert.equal(DEFAULT_SETTINGS.passwordResetMessage, PASSWORD_RESET_MESSAGE);
  assert.ok(DEFAULT_SETTINGS.contact.includes('team@auditsector.example'));
  assert.ok(DEFAULT_SETTINGS.contact.includes('mailto:'));
  assert.ok(DEFAULT_SETTINGS.generalHelp.startsWith('<p>'));
});

test('fetchAppSettings rejects a non-2xx response', async () => {
  await assert.rejects(
    fetchAppSettings({ fetcher: async () => json({}, 500) }),
    /status 500/,
  );
});

test('updateAppSettings sends contact in the snake_case payload', async () => {
  let body;
  await updateAppSettings(
    { contact: '<p>helpdesk@example.gov</p>' },
    {
      fetcher: async (path, options) => {
        assert.equal(path, '/api/settings');
        assert.equal(options.method, 'PUT');
        assert.equal(options.credentials, 'same-origin');
        assert.equal(options.headers['Content-Type'], 'application/json');
        body = JSON.parse(options.body);
        return json({ data: {} });
      },
    },
  );

  assert.deepEqual(body, { contact: '<p>helpdesk@example.gov</p>' });
});

test('updateAppSettings throws when the server rejects the change', async () => {
  await assert.rejects(
    updateAppSettings(
      { contact: '' },
      { fetcher: async () => json({ error: { code: 'INVALID_SETTINGS' } }, 400) },
    ),
    /status 400/,
  );
});
