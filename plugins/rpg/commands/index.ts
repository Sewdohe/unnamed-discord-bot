import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import { RPGClass, RPGClasses, type RPGPlayerRepository } from "../db/repository";

// ============ Configuration Type ============

export type RPGConfig = {
  enabled: boolean;
};

// ============ Main Command ============

/**
 * Main command with multiple subcommands
 * Demonstrates various Discord.js and framework features
 */
export function rpgMenuCommand(
  ctx: PluginContext<RPGConfig>,
  api: CoreUtilsAPI,
  playerRepo: RPGPlayerRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("rpg")
      .setDescription("Manage your character in the RPG system")
      .addSubcommand(sub =>
        sub.setName("choose-class")
          .setDescription("Choose a class for your RPG character")
      )
      .addSubcommand(sub =>
        sub.setName("display-profile")
          .addUserOption(opt => opt.setName("user").setDescription("User to display profile for"))
          .setDescription("Display a users RPG character profile")
      ),

    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "choose-class":
          await handleChooseClass(ctx, api, playerRepo, interaction);
          break;
        case "display-profile":
          await handleShowProfile(ctx, api, playerRepo, interaction);
          break;
      }
    },
  };
}

// ============ Subcommand Handlers ============

/**
 * Allow a player to choose a class for their RPG character
 */
async function handleChooseClass(
  ctx: PluginContext<RPGConfig>,
  api: CoreUtilsAPI,
  playerRepo: RPGPlayerRepository,
  interaction: ChatInputCommandInteraction
) {
  const player = await playerRepo.getRPGProfileByDiscordID(interaction.user.id);

  if (!player) {
    // No profile found, create a new one with default class
    const newPlayer = await playerRepo.createRPGProfile({
      user_id: interaction.user.id,
      discord_id: interaction.user.id,
      name: interaction.user.username,
      rpgClass: RPGClasses.Human,
      level: 1,
      experience: 0,
      health: 100,
      maxHealth: 100,
      strength: 1,
      mana: 25,
      agility: 1,
      intelligence: 1,
      vitality: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const embed = api.embeds.info(`Welcome ${interaction.user.username}, I noticed you're new here! I created a profile for you. Re-run the command to choose your class.`);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    // player already has a profile, check if they have a class
    if (player.rpgClass.name !== "Human") {
      // player already has a class. Let them know.
      try {
        const embed = api.embeds.info(`You already have a class, ${player.rpgClass.name}!`);
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      } catch (error) {
        ctx.logger.error("Error in choose-class handler:", error);
      }
    } else {
      // Player has a profile, but no class yet. Let them choose.
      try {
        const row = api.components.actionRow([
          { customId: "warrior", label: "Warrior", style: 3 }, // ButtonStyle.Success
          { customId: "mage", label: "Mage", style: 3 }, // ButtonStyle.Success
          { customId: "rogue", label: "Rogue", style: 3 }, // ButtonStyle.Success
          { customId: "cleric", label: "Cleric", style: 3 }, // ButtonStyle.Success
        ]);

        const classChooseEmbed = api.embeds.info(`It's time to choose a class, ${player.name}!`);
        await interaction.reply({ embeds: [classChooseEmbed], components: [row], flags: MessageFlags.Ephemeral });
        ctx.logger.info(`Waiting for class choice from user ${interaction.user.id}`);

        const filter = (i: any) => i.user.id === interaction.user.id;
        const collected = await interaction.channel?.awaitMessageComponent({ filter, time: 60000 });

        if (!collected) {
          const timeoutEmbed = api.embeds.error("Class selection timed out. Please try again.");
          await interaction.followUp({ embeds: [timeoutEmbed], flags: MessageFlags.Ephemeral });
          return;
        }

        let chosenClass: RPGClass;
        ctx.logger.info(`User ${interaction.user.displayName} selected class button: ${collected.customId}`);

        switch (collected.customId) {
          case "warrior":
            chosenClass = RPGClasses.Warrior;
            break;
          case "mage":
            chosenClass = RPGClasses.Mage;
            break;
          case "rogue":
            chosenClass = RPGClasses.Rogue;
            break;
          case "cleric":
            chosenClass = RPGClasses.Cleric;
            break;
          default:
            const invalidEmbed = api.embeds.error("Invalid class selection. Please try again.");
            await interaction.followUp({ embeds: [invalidEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        // apply classes base stats to player
        const updatedStats = {
          RPGClasse: chosenClass,
          health: player.health + chosenClass.baseHealth,
          maxHealth: player.maxHealth + chosenClass.baseHealth,
          mana: player.mana + chosenClass.baseMana,
          strength: player.strength + chosenClass.baseStrength,
          agility: player.agility + chosenClass.baseAgility,
          intelligence: player.intelligence + chosenClass.baseIntelligence,
          vitality: player.vitality + chosenClass.baseVitality,
        };
        await playerRepo.updatePlayer(player._id!, { ...updatedStats, updated_at: new Date() });

        const successEmbed = api.embeds.success(`You have successfully chosen the ${chosenClass.name} class! The classes base stats have been applied to your character.`);
        await collected.update({ embeds: [successEmbed], components: [] });
        ctx.logger.info(`User ${interaction.user.displayName} has chosen class: ${chosenClass.name}`);

        return;
      } catch (error) {
        ctx.logger.error("Error in choose-class handler:", error);
        return;
      }
    }

  }
}

/**
 * Allow a player to choose a class for their RPG character
 */
async function handleShowProfile(
  ctx: PluginContext<RPGConfig>,
  api: CoreUtilsAPI,
  playerRepo: RPGPlayerRepository,
  interaction: ChatInputCommandInteraction
) {

  const targetUser = interaction.options.getUser("user") || interaction.user;
  ctx.logger.info(`Attempting to display RPG profile for user: ${targetUser.id}`);

  const player = await playerRepo.getRPGProfileByDiscordID(interaction.user.id);

  if (!player) {
    const embed = api.embeds.error(`No RPG profile found for ${targetUser.username}.`);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  } else {
    const profileEmbed = new EmbedBuilder()
      .setTitle(`${player.name}'s RPG Profile`)
      .addFields(
        { name: "Class", value: player.rpgClass.name, inline: true },
        { name: "Level", value: player.level.toString(), inline: true },
        { name: "Experience", value: player.experience.toString(), inline: true },
        { name: "Health", value: `${player.health} / ${player.maxHealth}`, inline: true },
        { name: "Mana", value: player.mana.toString(), inline: true },
        { name: "Strength", value: player.strength.toString(), inline: true },
        { name: "Agility", value: player.agility.toString(), inline: true },
        { name: "Intelligence", value: player.intelligence.toString(), inline: true },
        { name: "Vitality", value: player.vitality.toString(), inline: true },
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setFooter({ text: `RPG Profile for ${player.name}` })
      .setTimestamp();

    await interaction.reply({ embeds: [profileEmbed] });
    ctx.logger.info(`Displayed RPG profile for user: ${targetUser.id}`);
  }
}
