# Chat Recap: design board for the first cohesive UI pass

Status: **implemented in the local app**. Twitch is connected; an actual live-stream capture still needs a broadcast to test.

## Visual direction

Combine the deep purple surfaces of Electric violet with the bright cyan of Neon dusk. Use pink for “What Mattered” in the headline. Remove the striped sun and perspective grid entirely. Use a quiet radial glow behind the header, with no illustration competing with the text.

| Role | Color |
| --- | --- |
| Page background | `#100B20` |
| Card background | `#1A1430` |
| Raised and selected surfaces | `#281D43` |
| Main text | `#FBF8FF` |
| Secondary text | `#D0C5E2` |
| Main action and brand star | `#C7ADFF` |
| Selected navigation underline, live status, links, focus | `#8BEEFF` |
| Sparse headline emphasis | `#FF83D5` |
| Borders | `#51416B` |

Headings use title case: capitalize the main words and keep short joining words such as “in” lower-case. The headline reads **“Your Chat: What Mattered”**. “Your Chat:” uses the regular bold face; “What Mattered” uses the Terminal pixel face in pink `#FF83D5`. Headings and explanatory copy are centered. Forms, quotes, and saved-session details remain left aligned because scanning those lines is easier that way. Status words accompany colors so meaning does not depend on color alone.

Use violet for section headings such as “Connect Your Channel,” “Live Chat,” “Your Recap,” and “Your Archive.” Use cyan for short field labels (“Client ID,” “Channel Name”), the live number, and archive counts (“4 messages · 2 topics”). The phrase beside the live number is violet. Longer descriptions stay muted so the important labels stand out.

## Navigation

**Selected direction:** left side navigation with four plain labels: **Connect**, **Live**, **Recaps**, **Archive**. Only the selected area is shown. The selected button has a cyan `#8BEEFF` underline and a subtle raised violet surface.

| Area | Main job | Primary action |
| --- | --- | --- |
| Connect | Save Twitch app details and approve access | Connect with Twitch |
| Live | Confirm capture is running and see message count | Open OBS overlay |
| Recaps | Review or build source-linked topic cards; try sample chat | Build recap |
| Archive | Find and reopen past sessions | Open session |

The user can switch areas at any time. The page picks an initial area only on load: Connect while unconfigured, Live for an active stream, Recaps after a finished session, and Connect for a configured account awaiting approval. It does not automatically move the user while they are reading or typing.

The theme picker disappears when this single palette is approved. Functional counts remain; decorative step numbers do not return.

**Selected mouse option:** a crisp 32 px pixel arrow with a white center, dark outline, and one-pixel cyan shadow. It appears over the app canvas and navigation. Text fields keep the ordinary text cursor; the fallback is the system arrow. Navigation buttons also lift slightly and gain a cyan underline and short offset shadow on hover. Keyboard focus has an equally clear outline, and reduced-motion settings remove the movement.

## Main states

- **Not configured:** Connect shows the two fields and a short explanation. Other areas remain reachable and show clear empty states.
- **Awaiting Twitch approval:** Connect keeps the code and approval link visible until authorization succeeds or expires. The next step is stated in one sentence.
- **Connected, offline:** Live says capture will start when the channel goes live. Recaps and Archive remain usable.
- **Capturing:** Live shows a clear status and message count. Recaps can show the current session without claiming it is final.
- **Recap building or failed:** Recaps shows progress or the error beside the build action, with Retry when appropriate.
- **Recap ready:** Cards show topic, distinct viewer count, quote, author, and expandable source messages.

## Responsive and accessibility rules

- At narrow widths, the left navigation moves above the content and wraps into two rows. Controls keep comfortable touch targets.
- The selected area has a visible label and programmatic state. Keyboard navigation, visible focus, and headings work without color cues.
- Keep the connection state visible in the header, but do not repeat it across every panel.
- Keep the local data and quote verification notes in quieter supporting text, close to the relevant action.

## Implementation

- Replaced the three-theme picker and sunset elements with the approved combined palette.
- Added the left navigation and four areas while preserving the existing Twitch and recap controls.
- Added the pink Terminal headline and self-contained pixel cursor.
- Checked navigation, saved-session reopening, the loaded Terminal font, and the two-column mobile navigation in the browser. A sample session generated a source-linked recap, Twitch connected, and the OBS overlay loaded. Live chat capture still needs a broadcast.

The design board is a preview. Its buttons switch preview areas; they do not connect to Twitch.
