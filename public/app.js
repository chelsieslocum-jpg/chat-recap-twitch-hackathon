const $ = id => document.getElementById(id);
const views = new Set(['connect', 'live', 'recaps', 'archive']);
let viewInitialized = false;
function showView(view, focusHeading = false) {
  if (!views.has(view)) return;
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
  document.querySelectorAll('.screen').forEach(screen => { screen.hidden = screen.id !== `screen-${view}`; });
  viewInitialized = true;
  if (focusHeading) $('screen-' + view).querySelector('h1').focus();
}
document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => showView(button.dataset.view, true));
});
let selected = null;
let current = null;
const sample = `demo_maple: Which keyboard are you using?\ndemo_fern: What is that keyboard model?\ndemo_comet: Thanks for the puzzle stream.\ndemo_otter: Can we do more logic puzzles next week?`;
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed.');
  return value;
}
function node(tag, text) { const element = document.createElement(tag); element.textContent = text; return element; }
function countLabel(count, singular, plural = `${singular}s`) { return `${count} ${count === 1 ? singular : plural}`; }
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function drawCards(cards) {
  $('cards').replaceChildren();
  for (const card of cards) {
    const article = node('article', ''); article.className = 'card';
    article.append(node('h3', card.topic), node('small', `${card.viewers} distinct viewer${card.viewers === 1 ? '' : 's'}`), node('blockquote', `“${card.quote}”`), node('div', `— ${card.quoteUser}`));
    article.lastChild.className = 'by';
    const details = node('details', ''); details.append(node('summary', `View ${countLabel(card.sources.length, 'source message')}`));
    for (const source of card.sources) { const p = node('p', `${source.user}: ${source.text}`); p.className = 'source'; details.append(p); }
    article.append(details); $('cards').append(article);
  }
}
function drawSession(item) {
  current = item; selected = item.id;
  $('recapBadge').textContent = item.status === 'ready-local' ? 'LOCAL RECAP' : item.status === 'ready-codex' ? 'CODEX RECAP' : item.status.toUpperCase();
  $('buildButton').hidden = !item.messages.length || item.status === 'building';
  $('buildButton').textContent = item.status === 'failed' ? 'Retry recap' : item.cards.length ? 'Rebuild recap' : 'Build recap';
  $('cards').replaceChildren();
  if (item.cards.length) { drawCards(item.cards); notice(`${countLabel(item.messages.length, 'captured message')} · ${countLabel(item.cards.length, 'source-linked topic')}${item.status === 'ready-local' ? ' · grouped on this computer' : ''}`); }
  else if (item.status === 'failed') notice(item.error || 'The recap failed. Try again.', true);
  else notice(`${countLabel(item.messages.length, 'message')} in this session. Ready to build.`);
  const done = item.cards.length > 0;
  [...$('pipeline').children].forEach((span, i) => { span.className = done || i === 0 ? 'done' : ''; });
}
async function refresh() {
  try {
    const state = await api('/api/state');
    const twitch = state.twitch;
    $('twitchStatus').textContent = twitch.status;
    $('savedHint').hidden = !twitch.configured;
    $('savedHint').textContent = twitch.connected ? 'Your channel is connected. Open Live to watch chat capture.' : 'App details are saved. Choose Connect with Twitch; use the fields only if you need to update them.';
    $('connectButton').hidden = twitch.connected;
    if (twitch.connected) $('deviceCode').hidden = true;
    $('clientId').placeholder = twitch.configured ? 'Saved on this computer' : 'From your Twitch app';
    $('configForm').querySelector('button').textContent = twitch.configured ? 'Update App Details' : 'Save App Details';
    $('connectionBadge').textContent = twitch.connected ? 'CONNECTED' : twitch.configured ? 'READY TO CONNECT' : 'NOT CONNECTED';
    document.querySelector('.sidebarStatus').classList.toggle('isConnected', twitch.connected);
    $('liveBadge').textContent = state.active ? 'CAPTURING' : 'OFF AIR';
    $('liveBadge').className = `badge ${state.active ? 'good' : ''}`;
    if (twitch.channel && !$('channel').value) $('channel').value = twitch.channel;
    if (state.active && !selected) drawSession(state.active);
    const sessions = await api('/api/sessions');
    const latestLive = sessions.find(session => session.kind === 'live');
    $('messageCount').textContent = state.active?.messages.length ?? latestLive?.message_count ?? 0;
    const messageCount = state.active?.messages.length ?? latestLive?.message_count ?? 0;
    $('messageCountLabel').textContent = `${messageCount === 1 ? 'message' : 'messages'} captured ${state.active ? 'this stream' : latestLive ? 'in your latest stream' : 'this stream'}`;
    $('latestRecapButton').hidden = !latestLive || Boolean(state.active);
    $('latestRecapButton').onclick = latestLive ? async () => {
      try { drawSession(await api(`/api/sessions/${latestLive.id}`)); showView('recaps', true); }
      catch (error) { notice(error.message, true); showView('recaps', true); }
    } : null;
    $('sessions').replaceChildren();
    if (!sessions.length) $('sessions').append(node('p', 'No sessions yet. Your first recap will appear here.'));
    for (const session of sessions) {
      const button = node('button', ''); button.className = 'session';
      button.append(node('span', `${session.channel ? `#${session.channel}` : 'Pasted chat'} · ${new Date(session.created_at).toLocaleString()}`), node('small', `${countLabel(session.message_count, 'message')} · ${countLabel(session.card_count, 'topic')}`));
      button.onclick = async () => { try { drawSession(await api(`/api/sessions/${session.id}`)); showView('recaps', true); } catch (error) { notice(error.message, true); showView('recaps', true); } };
      $('sessions').append(button);
    }
    if (!selected && sessions.length) drawSession(await api(`/api/sessions/${sessions[0].id}`));
    if (!viewInitialized) showView(!twitch.connected ? 'connect' : state.active ? 'live' : sessions.length ? 'recaps' : 'live');
    const summary = sessions.find(session => session.id === selected);
    if (summary && current && (
      summary.status !== current.status ||
      summary.message_count !== current.messages.length ||
      summary.card_count !== current.cards.length
    )) drawSession(await api(`/api/sessions/${selected}`));
    $('buildButton').disabled = state.processing;
    if (state.processing && selected === summary?.id && summary.status === 'building') notice(`Building recap: ${state.phase}…`);
  } catch (error) { $('twitchStatus').textContent = error.message; }
}
$('configForm').onsubmit = async event => { event.preventDefault(); try { await api('/api/twitch/config', { clientId: $('clientId').value.trim(), channel: $('channel').value.trim() }); await refresh(); } catch (error) { $('twitchStatus').textContent = error.message; } };
$('connectButton').onclick = async () => { try { const data = await api('/api/twitch/connect', {}); $('deviceCode').hidden = false; $('deviceCode').replaceChildren(node('a', `Enter ${data.userCode} at Twitch ↗`)); const link = $('deviceCode').firstChild; link.href = data.verificationUri; link.target = '_blank'; link.rel = 'noreferrer'; await refresh(); } catch (error) { $('twitchStatus').textContent = error.message; } };
$('tryWithoutTwitch').onclick = () => showView('recaps', true);
$('loadDemo').onclick = () => { $('chat').value = sample; };
$('pasteButton').onclick = async () => { try { const item = await api('/api/paste', { chat: $('chat').value }); drawSession(item); await refresh(); } catch (error) { notice(error.message, true); } };
$('buildButton').onclick = async () => { if (!selected) return; $('buildButton').disabled = true; notice('Grouping chat…'); try { const item = await api(`/api/sessions/${selected}/recap`, {}); drawSession(item); } catch (error) { notice(error.message, true); drawSession(await api(`/api/sessions/${selected}`)); } finally { $('buildButton').disabled = false; await refresh(); } };
refresh(); setInterval(refresh, 3000);
