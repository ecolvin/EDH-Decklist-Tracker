import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import pg from "pg";
//import bcrypt from "bcrypt";
//import passport from "passport";
//import { Strategy } from "passport-local";
//import GoogleStrategy from "passport-google-oauth2";
//import session from "express-session";
import env from "dotenv";

import * as settings from "./settings.js";
import * as lands from "./lands.js";

const app = express();
const port = 3000;
const saltRounds = 10;
const edhrecURL = "https://json.edhrec.com/pages/commanders/";
const moxfieldURL = "https://api2.moxfield.com/v3/decks/all/";
env.config();

/*
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
*/

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


//app.use(passport.initialize());
//app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

async function fetchAllCommanders() {
  try {
    const response = await axios.get('https://api.scryfall.com/cards/search', {
      params: {
        q: 'is:commander',
        unique: 'cards',
        order: 'name'
      }
    });
    
    const commanders = response.data.data.map(card => card.name);
    return commanders;
  } catch (error) {
    console.error('Error fetching commanders:', error);
    return [];
  }
}

function sanitize(text)
{
    return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

function sanitizeDecklist(list, commander)
{
    return list.split('\n').map(name => {
        return name.replace(/^(\d+)\s+(.*)/, '$2');
    }).filter(name => name && name.trim() !== '' && name.trim() !== commander.trim());
}


//Turn EDHRec Cardlists into a single list of all the cards with a field (list) that tracks which list they came from.
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

function getAllCards(commanderData)
{
    const cardList = []

    for(const category of commanderData.cardlists)
    {
        for(const card of category)
        {
            cardList.push(card);
        }
    }

    return cardList;
}

function getLandOrder(colorIdentity)
{
    const lands = {mdfcs: [], duals: [], basics: []};

    const numColors = colorIdentity.length;
    switch(numColors)
    {
        case 0:
            lands.basics.add("Wastes");
        case 1:
            lands.basics.add();
        case 2:
        case 3:
        case 4:
        case 5:

    }

    return lands;
}

function generateDecklist(commanderData)
{
    let deckList = [];

    let staples = new Map();
    let flexCards = new Map();
    let maybeboard = new Map();
    let newCards = new Map();

    let cardCount = 1;
    if(commanderData.card.is_partner)
    {
        cardCount++;
    }

    const colorIdentity = commanderData.card.color_identity;
    const numColors = colorIdentity.length;

    const landOrder = getLandOrder(colorIdentity);

    //generate mana base
    //-check list for MDFCs (in case some niche ones fit the deck)
    //-check list for utility lands
    //if tier 3, select game changers

    const cardData = getAllCards(commanderData);

    if(settings.smartDeckGen)
    {    
        for(const card of cardData)
        {
            const numDecks = card.num_decks;
            const potentialDecks = card.potential_decks;
            if(potentialDecks == 0)
            {
                continue; //Avoid divide by zero error
            }
            if(numDecks/potentialDecks >= settings.stapleThreshold)
            {
                if(numDecks > settings.newCardThreshold)
                {
                    staples.push(card);
                    cardCount++;
                }
                else if(settings.newCardStaple)
                {
                    staples.push(card);
                    cardCount++;
                    newCards.push(card.name);
                }
            }
            else if(numDecks/potentialDecks >= settings.flexThreshold)
            {
                if(numDecks > settings.newCardThreshold)
                {
                    flexCards.push(card);
                    cardCount++;
                }
                else if(settings.newCardFlex)
                {
                    flexCards.push(card);
                    cardCount++;
                    newCards.push(card.name);
                }
            }
            else if(numDecks/potentialDecks >= settings.maybeThreshold)
            {
                if(numDecks > settings.newCardThreshold)
                {
                    maybeboard.push(card);
                }
                else if(settings.newCardMaybe)
                {
                    maybeboard.push(card);
                    newCards.push(card.name);
                }
            }
            else
            {

            }
        }
    }
    else
    {
        cardData.sort((a, b) => {
            const aPercent = a.potential_decks !== 0 ? (a.field1 / a.field2) : 0;
            const bPercent = b.potential_decks !== 0 ? (b.field1 / b.field2) : 0;
            
            return bPercent - aPercent;
        });

        const numCardsNeeded = 100 - deckList.length;

        for(let i = 0; i < numCardsNeeded; i++)
        {
            deckList.push(cardData[i]);
        }

        return deckList;
    }
}

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.post("/commander", async (req, res) => {
    const commander = sanitize(req.body.commander);
    
    try
    {
        const result = await axios.get(edhrecURL + commander + ".json");
        const themes = result.data.taglinks.filter(theme => theme.count >= minThemeCount);
    }
    catch(err)
    {

    }
});

app.post("/generate", async (req, res) => {
    const commander = "";
    const theme = "";

    try
    {
        const result = await axios.get(edhrecURL + commander + "/" + theme + ".json");
    }
    catch(err)
    {

    }

});

app.post("/updates", async (req, res) => {
    const commander = sanitize(req.body.commander);
    const theme = req.body.theme ? sanitize(req.body.theme) : "";

    let endpoint = edhrecURL + commander;
    if(theme.trim() !== "")
    {
        endpoint += "/" + theme;
    }
    if(settings.expensive)
    {
        endpoint += "/expensive";  //"/budget" if we want to add budget option
    }

    const curList = sanitizeDecklist(req.body.list, req.body.commander);
    
    try
    {
        const result = await axios.get(endpoint + ".json");
        const cardList = reformatEDHRecData(result.data.container.json_dict.cardlists);
        const topCards = cardList.filter(card => card.inclusionPercent >= settings.updateThreshold);
        const updates = topCards.filter(card => !curList.includes(card.name)).map(card => card.name);

        //console.log(updates);

        const cutSuggestions = curList.flatMap(name => {
            const cardObj = cardList.find(card => card.name === name);
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
                return [`${name} - ${cardObj.inclusionPercent}%`];
            }
            else
            {
                return [];
            }
        });

        //console.log(cutSuggestions);

        res.status(200).json({
            updates: updates,
            cuts: cutSuggestions
        });

        //Get Potential Cuts (and list their percentages)
    }
    catch(err)
    {
        res.status(404).end();
        console.error(err);
    }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

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
-Companion Checker and recommendation (if only a few cards away from being able to add a companion)






*/
