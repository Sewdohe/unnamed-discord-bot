# Counting Game Plugin

A classic Discord counting game where users count sequentially in designated channels. Features statistics tracking, leaderboards, and customizable rules!

## Features

- 🔢 **Sequential Counting** - Users count from 1, 2, 3... in designated channels
- 🔄 **Alternating Accounts** - Optional rule requiring different users to alternate
- 🚫 **Clean Channels** - Optionally delete non-counting messages
- 📊 **Statistics** - Track successful/failed counts per user
- 🏆 **Leaderboards** - See top counters and channel high scores
- 🎉 **Milestones** - Celebrate achievements (100, 200, 300, etc.)
- ⚙️ **Configurable** - Customize reactions, rules, and behavior

## Quick Start

### 1. Set Up a Counting Channel

```
/counting setup #counting
```

This creates a counting channel where users can start counting!

### 2. Start Counting

In the counting channel, simply send:
```
1
```

Then other users continue:
```
2
3
4
...
```

### 3. View Stats

Check the current count:
```
/counting status
```

View your statistics:
```
/counting stats
```

See the leaderboard:
```
/counting leaderboard
```

## Commands

### Setup & Management (Admin Only)

**`/counting setup #channel`**
- Set up a channel for counting
- Requires: Manage Channels permission
- Example: `/counting setup #counting-channel`

**`/counting remove #channel`**
- Remove a counting channel
- Requires: Manage Channels permission
- Confirms before deletion

**`/counting reset [#channel]`**
- Reset the count to 0
- Requires: Manage Channels permission
- Defaults to current channel if not specified

### Information

**`/counting status [#channel]`**
- View current count and channel statistics
- Shows: current count, high score, last counter, accuracy
- Defaults to current channel

**`/counting stats [user]`**
- View counting statistics for a user
- Shows: successful counts, failed counts, accuracy, highest contribution
- Defaults to yourself if user not specified

**`/counting leaderboard [type]`**
- View various leaderboards
- Types:
  - `counts` - Most successful counts (default)
  - `highest` - Highest contribution (highest number reached)
  - `channels` - Channel high scores

## Game Rules

### Default Rules

1. **Sequential Counting**: Numbers must be in order (1, 2, 3...)
2. **Alternating Accounts**: Same user cannot count twice in a row
3. **No Talking**: Only counting messages allowed (others deleted)
4. **Reset on Fail**: Count resets to 0 on mistakes

### What Counts as a Mistake?

- ❌ **Wrong Number**: Sending the wrong number (e.g., sending 5 when 4 is expected)
- ❌ **Same User**: Counting twice in a row (if alternating is enabled)
- ❌ **Non-Number**: Sending non-counting messages (if talking is disabled)

### What Happens on Mistakes?

Depending on configuration:
- Count resets to 0 (default), or
- Count continues from where it left off
- Failure is recorded in user statistics
- Failure reaction is added to the message

## Configuration

Edit `config/counting-game.yaml` to customize behavior:

```yaml
# Counting Game Configuration

# Enable or disable the counting game
enabled: true

# Require different users to alternate (same user can't count twice in a row)
alternatingAccounts: true

# Allow non-counting messages in counting channels (if false, they will be deleted)
allowTalking: false

# Reactions for correct/incorrect counts
reactions:
  success: "✅"    # Reaction for correct counts
  failure: "❌"    # Reaction for incorrect counts

# Reset the count to 0 when someone makes a mistake
resetOnFail: true

# Milestone announcements
milestones:
  enabled: true          # Announce milestone achievements
  interval: 100          # Milestone interval (e.g., every 100 counts)

# Pre-configured counting channel IDs (can also use /counting setup)
countingChannels: []
```

### Configuration Options Explained

**`alternatingAccounts`** (default: `true`)
- `true`: Users must alternate (more challenging)
- `false`: Same user can count multiple times in a row

**`allowTalking`** (default: `false`)
- `true`: Non-counting messages are allowed
- `false`: Non-counting messages are automatically deleted

**`resetOnFail`** (default: `true`)
- `true`: Count resets to 0 on any mistake
- `false`: Count continues even after mistakes (only the failed attempt doesn't count)

**`reactions.success`** (default: `"✅"`)
- Emoji reaction added to correct counts
- Can use any emoji the bot has access to

**`reactions.failure`** (default: `"❌"`)
- Emoji reaction added to incorrect counts
- Can use any emoji the bot has access to

## Examples

### Relaxed Mode
For casual counting with friends:
```yaml
alternatingAccounts: false  # Same user can count multiple times
allowTalking: true          # Chat while counting
resetOnFail: false          # Keep counting after mistakes
```

### Hardcore Mode
For serious counting challenges:
```yaml
alternatingAccounts: true   # Must alternate users
allowTalking: false         # Only counting allowed
resetOnFail: true           # Reset on any mistake
```

### Custom Reactions
Use custom emojis:
```yaml
reactions:
  success: "🎉"
  failure: "💥"
```

## Statistics Tracked

### Per Channel
- Current count
- High score (all-time best)
- Total successful counts
- Total failures
- Accuracy percentage
- Last user who counted

### Per User
- Total successful counts
- Total failed counts
- Accuracy percentage
- Highest contribution (highest number reached)

## Leaderboards

### User Leaderboard (Most Counts)
Shows users with the most successful counts:
```
🥇 @User1 - 523 successful counts
🥈 @User2 - 412 successful counts
🥉 @User3 - 387 successful counts
```

### Highest Contribution
Shows users who reached the highest numbers:
```
🥇 @User1 - Highest: 892
🥈 @User2 - Highest: 765
🥉 @User3 - Highest: 654
```

### Channel Leaderboard
Shows channels with the highest scores:
```
1. #counting-1
   Current: 234 | High Score: 567
2. #counting-2
   Current: 89 | High Score: 432
```

## Milestones

The bot celebrates special achievements:

- **Every 100 counts**: "🎉 Milestone reached! Count: 100"
- **New high score**: "🏆 New high score! Count: 234"

Configure milestone interval in the config file.

## Tips & Strategies

### For Server Admins

1. **Create dedicated channels**: Use `/counting setup` in a new channel
2. **Set clear rules**: Pin a message explaining your server's counting rules
3. **Choose appropriate settings**:
   - Active server? Use `alternatingAccounts: true`
   - Small community? Try `resetOnFail: false`
4. **Monitor statistics**: Check `/counting status` regularly

### For Players

1. **Pay attention**: Double-check the current count before posting
2. **Check who counted last**: Avoid breaking the alternating rule
3. **Be quick**: In competitive servers, speed matters!
4. **Track your stats**: Use `/counting stats` to see your progress
5. **Aim for milestones**: Help reach those round numbers (100, 500, 1000...)

## Troubleshooting

### Bot doesn't react to counts

**Check:**
- Is the channel set up? Use `/counting setup #channel`
- Does the bot have permission to add reactions?
- Is the plugin enabled in config?

### Messages are being deleted

**Reason:**
- `allowTalking` is set to `false`
- Only counting messages are allowed

**Solution:**
- Change config to `allowTalking: true`, or
- Use a different channel for chatting

### Same user rule isn't working

**Check:**
- Verify `alternatingAccounts: true` in config
- Make sure config file has been saved
- Restart the bot after config changes

### Count keeps resetting

**Reason:**
- `resetOnFail: true` in config
- Someone is making mistakes

**Solution:**
- Change to `resetOnFail: false` for more forgiving gameplay, or
- Be more careful with counting!

## Database Schema

The plugin uses two MongoDB collections:

### `counting_game_games`
Stores game state per channel:
```typescript
{
  guild_id: string,
  channel_id: string,
  current_count: number,
  high_score: number,
  last_user_id: string | null,
  last_message_id: string | null,
  total_counts: number,
  total_fails: number,
  created_at: Date,
  updated_at: Date
}
```

### `counting_game_user_stats`
Stores user statistics:
```typescript
{
  guild_id: string,
  user_id: string,
  successful_counts: number,
  failed_counts: number,
  highest_contribution: number,
  created_at: Date,
  updated_at: Date
}
```

## Permissions Required

### Bot Permissions
- Read Messages
- Send Messages
- Manage Messages (if `allowTalking: false`)
- Add Reactions
- Embed Links

### User Permissions
- **Setup/Remove/Reset**: Manage Channels
- **Stats/Status/Leaderboard**: None (everyone can use)

## Advanced Usage

### Pre-configure Channels

Instead of using commands, you can pre-configure channels in the config:

```yaml
countingChannels:
  - "123456789012345678"  # Channel ID 1
  - "876543210987654321"  # Channel ID 2
```

### Multiple Counting Channels

You can have multiple counting channels in the same server:
- Each channel has its own count and high score
- Statistics are tracked per server, not per channel
- Use `/counting leaderboard channels` to compare

### Custom Reactions

Use any emoji the bot has access to:
```yaml
reactions:
  success: "🎯"  # Default emoji
  failure: "💥"  # Default emoji
```

For custom server emojis, use the emoji ID:
```yaml
reactions:
  success: "<:custom_check:123456789>"
  failure: "<:custom_x:987654321>"
```

## API / Integration

The plugin exposes repositories that other plugins can use:

```typescript
// Get the counting-game plugin
const countingGame = ctx.getPlugin("counting-game");

// Access repositories (if exposed)
// Example integration for custom features
```

## Support

If you encounter issues:
1. Check the bot logs for error messages
2. Verify configuration in `config/counting-game.yaml`
3. Ensure bot has required permissions
4. Try restarting the bot after config changes

## Credits

Created for Discord bot framework with MongoDB support.

---

**Have fun counting!** 🔢✨
