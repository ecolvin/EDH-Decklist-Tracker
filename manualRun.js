import axios from "axios";
import env from "dotenv";
import fs from "fs/promises";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import * as settings from "./settings.js";

puppeteer.use(StealthPlugin());

const TEST_MODE = false;
const TEST_MOXFIELD_PATH = "./json/Zegana Moxfield.json";
const TEST_EDHREC_PATH = "./json/Zegana.json";

const edhrecURL = "https://json.edhrec.com/pages/commanders/";
const redirectURL = "https://json.edhrec.com/pages";
const moxfieldURL = "https://api2.moxfield.com/v3/decks/all/";
env.config();

let moxfieldDeckIDs = [
    "PHcWihiVNE6gcmZ1mYWYeg", //Atraxa Blink
    "lS9porqsm06ZHdKRZ09vGQ", //Breya Thopters
    "0BPu5Ync30avDbaObfYibw", //Esika Planeswalkers
    "ajmUGiGJmkCKsrjggPuwBQ", //Ghalta Stompy
    "mQ8OAcyWWUGmn6GFDBaRpg", //Kaalia Skies
    "yEcuYOleeUG9jJItuV9Cvg", //Lord Windgrace Lands
    "R3cVmeAqj0WLva5itxrEeQ", //Purphoros Tokens
    "W1XsF6oaGEiZRFKUSbP0VQ", //Sam and Frodo Food
    "uIj2ltkHyEaz4w6c6sEAXQ", //Tuvasa Enchantress
    "8ZCO8v4RaEeWkojw8JppYg", //Ur-Dragon Tribal
    "VWFyri4kVEaJgzZX9Y-HTA"  //Zegana Card Draw
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/*Turn EDHRec Cardlists into a single list of all the cards with a field (list) that tracks which list they came from.*/
function reformatEDHRecData(cardLists)
{
    const cardList = [];

    cardLists.forEach(list => {
        list.cardviews.forEach(card => {
            const newCard = card;
            newCard.list = list.header;
            newCard.inclusionPercent = card.potential_decks ? ((card.num_decks/card.potential_decks)*100).toFixed(2) : 0;
            cardList.push(newCard);
        });
    });

    return cardList;
}

function sanitize(text)
{
    return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

async function getUpdates(commander, theme, curList, sideboard)
{
    let endpoint = edhrecURL + commander;
    if(theme.trim() !== "")
    {
        endpoint += "/" + theme;
    }
    const endpointExp = endpoint + "/expensive";
    
    try
    {
        await delay(1000);   //avoid rate-limits
        let result;
        //let expensive;

        if(TEST_MODE)
        {
            try
            {
                const data = await fs.readFile(TEST_EDHREC_PATH, 'utf8');
                result = JSON.parse(data);
                //expensive = result;
            }
            catch(err)
            {
                console.err("Error loading JSON:", error);
                return {};
            }
        }
        else
        {
            result = await axios.get(endpoint + ".json");
            if("redirect" in result.data)
            {
                await delay(1000);   //avoid rate-limits
                result = await axios.get(redirectURL + result.data.redirect + ".json");
            }
            result = result.data;

            /*expensive = await axios.get(endpointExp + ".json");
            if("redirect" in expensive.data)
            {
                await delay(1000);   //avoid rate-limits
                expensive = await axios.get(redirectURL + expensive.data.redirect + ".json");
            }
            expensive = expensive.data;*/
        }
        const cardList = reformatEDHRecData(result.container.json_dict.cardlists);
        //const cardListExp = reformatEDHRecData(expensive.container.json_dict.cardlist);
        
        const topCards = cardList.filter(card => card.inclusionPercent >= settings.updateThreshold);
        //const topCardsExp = cardListExp.filter(card => card.inclusionPercent >= settings.updateThreshold);
        
        const updates = topCards.filter(card => {
            const inCurList = curList.some(name => name === card.name || name.split(" // ")[0] === card.name);
            const inSideboard = sideboard.some(name => name === card.name || name.split(" // ")[0] === card.name);
            return !inCurList && !inSideboard;
        }).map(card => (card.list === "Game Changers" ? "**" : "") + card.name + " - " + card.inclusionPercent + "%");
        
        //Add expensive percentages
        //Fix sorting to factor in new expensive percentages/formatting

        const cutSuggestions = curList.flatMap(name => {
            const cardObj = cardList.find(card => card.name === name || card.name === name.split(" // ")[0]);
            if(cardObj && (cardObj.list === "Lands" || cardObj.list === "Utility Lands"))
            {
                return [];
            }
            else if(!cardObj)
            {
                return [`${name} - Card not found`];
            }
            else if(cardObj.inclusionPercent <= settings.cutThreshold)
            {
                const gcString = cardObj.list === "Game Changers" ? "**" : "";
                return [`${gcString}${name} - ${cardObj.inclusionPercent}%`];
            }
            else
            {
                return [];
            }
        });

        const sortByPercentages = (list) => {
            return list.sort((a, b) => {
                const getPercentage = (str) => {
                    if (str.includes("Card not found")) return -1;
                    const match = str.match(/(\d+\.\d+)%/);
                    return match ? parseFloat(match[1]) : -1;
                };
                
                const percentA = getPercentage(a);
                const percentB = getPercentage(b);
        
                return percentB - percentA;
            });
        }  

        return {
            updates: sortByPercentages(updates),
            cuts: sortByPercentages(cutSuggestions)
        };
    }
    catch(err)
    {
        console.error(err);
        return null;
    }
}

function extractThemeFromDeckname(deckName, commanders)
{
    let commanderName = "";
    let newDeckName = deckName;
    if(commanders.length > 1)
    {
        const idx = deckName.indexOf("and");
        const firstCommander = deckName.substr(0, idx-1);
        newDeckName = deckName.substr(idx+4);
        if(commanders[0].card.name.includes(firstCommander))
        {
            commanderName = commanders[1].card.name;
        }
        else
        {
            commanderName = commanders[0].card.name;
        }
    }
    else
    {
        commanderName = commanders[0].card.name
    }

    let match = "";
    const words = newDeckName.split(' ');
    for(const word of words)
    {
        let test = match;
        if(test.length > 0)
        {
          test += " ";
        }
        if(commanderName.includes(test))
        {
            match += word;
        }
        else
        {
            break;
        }
    }

    return newDeckName.substr(match.length + 1).trim();
}

async function getViaBrowser(deckId)
{
    const browser = await puppeteer.launch({     
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ] 
    });
    const page = await browser.newPage();
    
    try {
        // Navigate directly to the API URL that shows JSON
        await page.goto(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        // Get the entire page content as text (which is the JSON)
        const jsonText = await page.evaluate(() => {
            return document.body.textContent;
        });
        
        // Parse the JSON
        const deckData = JSON.parse(jsonText);
        
        await browser.close();
        return deckData;
        
    } catch (error) {
        await browser.close();
        console.error('Error:', error);
        return null;
    }
}

async function getTestJSON()
{
    try
    {
        const data = await fs.readFile(TEST_MOXFIELD_PATH, 'utf8');
        return JSON.parse(data);
    }
    catch(err)
    {
        console.err("Error loading JSON:", error);
        return {};
    }
}

async function getMoxfieldLists()
{
    let decklists = [];

    if(TEST_MODE)
    {
        moxfieldDeckIDs = ["0"];
    }

    for(const id of moxfieldDeckIDs)
    {
        let result;

        try
        {
            await delay(1000);   //avoid rate-limits
            if(TEST_MODE)
            {
                result = await getTestJSON();
            }
            else
            {
                result = await getViaBrowser(id);
            }
        }
        catch(err)
        {
            console.error("Unable to fetch decklist for id: " + id);
            console.error(err);
            continue;
        }

        const commanderData = result.boards.commanders;
        const cards = Object.values(result.boards.mainboard.cards);
        const sideboard = Object.values(result.boards.sideboard.cards);
        const deckName = result.name;

        if(commanderData.count === 0)
        {
            console.error("No commander found for decklist: " + deckName);
            continue;
        }

        const commanders = Object.values(commanderData.cards);    
        let commanderName = sanitize(commanders[0].card.name);
        if(commanders[0].card.card_faces.length > 0)
        {
            commanderName = sanitize(commanders[0].card.card_faces[0].name);
        }
        if(commanderData.count > 1)
        {
            commanderName += "-" + sanitize(commanders[1].card.name);
        }

        const theme = extractThemeFromDeckname(deckName, commanders);

        decklists.push({
            commander: commanderName, 
            theme: sanitize(theme),
            deckList: cards.map(card => card.card.name),
            sideboard: sideboard.map(card => card.card.name)
        });
    }

    return decklists;
}

async function main()
{
    const decklists = await getMoxfieldLists();
    for(const decklist of decklists)
    {
        const updates = await getUpdates(decklist.commander, decklist.theme, decklist.deckList, decklist.sideboard);
        
        if(updates === null)
        {
            console.error("Unable to find updates for " + decklist.commander);
            continue;
        }

        const filename = "manual_update_reports/" + decklist.commander + ".txt";
        let file;

        try
        {
            file = await fs.open(filename, 'w');

            await file.writeFile('');

            await file.write("Recommended Updates\n");
            await file.write("-------------------\n");
            const updateList = updates.updates.join("\n");
            await file.write(updateList);
            await file.write("\n\n\n");
            await file.write("Recommended Cuts\n");
            await file.write("-------------------\n");
            const cutList = updates.cuts.join("\n");
            await file.write(cutList);            
        }
        catch(err)
        {
            console.error('Error writing to file ' + filename + ": " + err);
        }
        finally
        {
            if(file) {
                await file.close();
            }
        }
    }
}

await main();

/*
json.container.jsondict - All the important data we need

.cardlists - array of categories as JSON objects
.cardlists[i].cardviews - array of cards in category i as JSON objects

.card - details about the commander(s)




https://json.edhrec.com/pages/commanders/commander-name-here.json
https://json.edhrec.com/pages/commanders/commander-name-here/theme.json

Partner:
frodo-adventurous-hobbit-sam-loyal-attendant

if backwards:
{"redirect":"/commanders/frodo-adventurous-hobbit-sam-loyal-attendant"}





FUTURE FEATURES
--------------------------
-Ignore Sideboard cards
-Recommend Game Changers if less than 3

-Companion Checker and recommendation (if only a few cards away from being able to add a companion)

*/
