// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// Licensed under the Amazon Software License
// http://aws.amazon.com/asl/

const Alexa = require('ask-sdk');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');

const languageStrings = {
  'en': require('./languages/en.js'),
};

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    let hintText = '';
    // IF THE USER HAS HINTS AVAILABLE, LET THEM KNOW HOW MANY.
    if (sessionAttributes.hintsAvailable > 0) hintText = requestAttributes.t('HINTS_AVAILABLE', sessionAttributes.hintsAvailable);

    const speechText = requestAttributes.t('WELCOME_MESSAGE', hintText);

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  },
};

const YesIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    // GET RANDOM SHOW FROM OUR DATA.
    const show = requestAttributes.t('CLUES');
    sessionAttributes.currentShow = show;
    // GET RANDOM ACTOR FROM OUR SHOW.
    const randomActor = getRandom(1, 3);
    sessionAttributes.currentActors = randomActor.toString();

    const speakOutput = getClue(handlerInput);
    const repromptOutput = speakOutput;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(repromptOutput)
      .getResponse();
  },
};

const BuyHintHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'BuyHintIntent';
  },
  async handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    // SAVING SESSION ATTRIBUTES TO PERSISTENT ATTRIBUTES,
    // BECAUSE THE SESSION EXPIRES WHEN WE START A CONNECTIONS DIRECTIVE.
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
    persistentAttributes.currentSession = sessionAttributes;
    handlerInput.attributesManager.savePersistentAttributes();

    const ms = handlerInput.serviceClientFactory.getMonetizationServiceClient();

    return ms.getInSkillProducts(handlerInput.requestEnvelope.request.locale).then((res) => {
      const hintpack = res.inSkillProducts.filter(record => record.referenceName === 'Five_Hint_Pack');
      if (hintpack.length > 0 && hintpack[0].purchasable === 'PURCHASABLE') {
        return handlerInput.responseBuilder
          .addDirective({
            'type': 'Connections.SendRequest',
            'name': 'Buy',
            'payload': {
              'InSkillProduct': {
                'productId': hintpack[0].productId,
              },
            },
            'token': 'correlationToken',
          })
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t('CANNOT_BUY_RIGHT_NOW'))
        .getResponse();
    });
  },
};

const CancelPurchaseHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'CancelPurchaseIntent';
  },
  async handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    // SAVING SESSION ATTRIBUTES TO PERSISTENT ATTRIBUTES,
    // BECAUSE THE SESSION EXPIRES WHEN WE START A CONNECTIONS DIRECTIVE.
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
    persistentAttributes.currentSession = sessionAttributes;
    handlerInput.attributesManager.savePersistentAttributes();

    const ms = handlerInput.serviceClientFactory.getMonetizationServiceClient();

    return ms.getInSkillProducts(handlerInput.requestEnvelope.request.locale).then((res) => {
      const hintpack = res.inSkillProducts.filter(record => record.referenceName === 'Five_Hint_Pack');
      if (hintpack.length > 0 && hintpack[0].purchasable === 'PURCHASABLE') {
        return handlerInput.responseBuilder
          .addDirective({
            'type': 'Connections.SendRequest',
            'name': 'Cancel',
            'payload': {
              'InSkillProduct': {
                'productId': hintpack[0].productId,
              },
            },
            'token': 'correlationToken',
          })
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t('CANNOT_BUY_RIGHT_NOW'))
        .getResponse();
    });
  },
};

const BuyHintResponseHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'Connections.Response' &&
      (handlerInput.requestEnvelope.request.name === 'Upsell' ||
        handlerInput.requestEnvelope.request.name === 'Buy');
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
    // REHYDRATE SESSION ATTRIBUTES AFTER RETURNING FROM THE CONNECTIONS DIRECTIVE.
    if (persistentAttributes.currentSession !== undefined) {
      sessionAttributes.currentShow = persistentAttributes.currentSession.currentShow;
      sessionAttributes.currentActors = persistentAttributes.currentSession.currentActors;
    }
    
    console.log(`SESSION ATTRIBUTES = ${JSON.stringify(sessionAttributes)}`);

    let speakOutput = '';

    // IF THE USER DECLINED THE PURCHASE.
    if (handlerInput.requestEnvelope.request.payload.purchaseResult === 'DECLINED') {
      speakOutput = requestAttributes.t('NO_HINTS_FOR_NOW', getClue(handlerInput));
    } else if (handlerInput.requestEnvelope.request.payload.purchaseResult === 'ACCEPTED') {
      // IF THE USER SUCCEEDED WITH THE PURCHASE.
      if (sessionAttributes.currentActors !== undefined
        && sessionAttributes.currentActors.length !== 3) {
        useHint(handlerInput);
        const randomActor = getRandomActor(sessionAttributes.currentActors);
        sessionAttributes.currentActors += randomActor.toString();
      }
      speakOutput = requestAttributes.t('THANK_YOU', getClue(handlerInput));
    } else if (handlerInput.requestEnvelope.request.payload.purchaseResult === 'ERROR') {
      // IF SOMETHING ELSE WENT WRONG WITH THE PURCHASE.
      speakOutput = requestAttributes.t('UNABLE_TO_SELL', getClue(handlerInput));
    }

    // CLEAR OUR OUR PERSISTED SESSION ATTRIBUTES.
    persistentAttributes.currentSession = undefined;
    handlerInput.attributesManager.savePersistentAttributes();

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const AnswerHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      (handlerInput.requestEnvelope.request.intent.name === 'AnswerIntent' ||
        handlerInput.requestEnvelope.request.intent.name === 'AMAZON.FallbackIntent');
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    let speakOutput = requestAttributes.t('NOT_CORRECT');
    // IF THE USER'S ANSWER MATCHED ONE OF THE SLOT VALUES, THEY WERE CORRECT.
    if (isErSuccessMatch('answer', handlerInput)) {
      if (handlerInput.requestEnvelope.request.intent.slots.answer.resolutions.resolutionsPerAuthority[0].values[0].value.name.toLowerCase()
        === sessionAttributes.currentShow.showName.toLowerCase()) {
        speakOutput = requestAttributes.t('CORRECT_ANSWER', sessionAttributes.currentShow.showName);
      }
    }

    const repromptOutput = speakOutput;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(repromptOutput)
      .getResponse();
  },
};

const HintInventoryHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'HintInventoryIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    const speakOutput = requestAttributes.t('REPLAY_PROMPT', sessionAttributes.hintsAvailable);
    const repromptOutput = speakOutput;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(repromptOutput)
      .getResponse();
  },
};

const IDontKnowHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'IDontKnowIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    const speakOutput = requestAttributes.t('GAVE_UP', sessionAttributes.currentShow.showName);
    const repromptOutput = speakOutput;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(repromptOutput)
      .getResponse();
  },
};

const HintHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'HintIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    let speakOutput = '';
    let repromptOutput = '';

    // IF THE USER HAS ALREADY USED TWO HINTS ON THIS PUZZLE, DON'T LET THEM USE ANOTHER.
    // WE DON'T HAVE MORE INFORMATION TO OFFER THEM.
    if (sessionAttributes.currentActors.length === 3) {
      speakOutput = requestAttributes.t('NO_MORE_CLUES', getClue(handlerInput));
      repromptOutput = speakOutput;

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptOutput)
        .getResponse();
    } else if (sessionAttributes.hintsAvailable > 0) {
      // IF THE USER HAS AVAILABLE HINTS, USE ONE.
      useHint(handlerInput);
      console.log(`CURRENT ACTOR = ${sessionAttributes.currentActors}`);
      const randomActor = getRandomActor(sessionAttributes.currentActors);
      console.log(`RANDOM ACTOR = ${randomActor}`);
      sessionAttributes.currentActors += randomActor.toString();
      speakOutput = requestAttributes.t('NEW_CLUE', getClue(handlerInput));
      repromptOutput = speakOutput;

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptOutput)
        .getResponse();
    }
    // OTHERWISE, OFFER THEM AN OPPORTUNITY TO BUY A HINT.

    // SAVING SESSION ATTRIBUTES TO PERSISTENT ATTRIBUTES,
    // BECAUSE THE SESSION EXPIRES WHEN WE START A CONNECTIONS DIRECTIVE.
    const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
    persistentAttributes.currentSession = sessionAttributes;
    handlerInput.attributesManager.savePersistentAttributes();

    const ms = handlerInput.serviceClientFactory.getMonetizationServiceClient();

    return ms.getInSkillProducts(handlerInput.requestEnvelope.request.locale).then((res) => {
      const hintpack = res.inSkillProducts.filter(record => record.referenceName === 'Five_Hint_Pack');
      if (hintpack.length > 0 && hintpack[0].purchasable === 'PURCHASABLE') {
        return handlerInput.responseBuilder
          .addDirective({
            'type': 'Connections.SendRequest',
            'name': 'Upsell',
            'payload': {
              'InSkillProduct': {
                'productId': hintpack[0].productId,
              },
              'upsellMessage': requestAttributes.t('UPSELL_MESSAGE'),
            },
            'token': 'correlationToken',
          })
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t('CURRENTLY_UNAVAILABLE'))
        .getResponse();
    });
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t('HELP_PROMPT');
    const repromptOutput = speakOutput;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(repromptOutput)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent' ||
        handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent' ||
        handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NoIntent')) ||
      (handlerInput.requestEnvelope.request.type === 'Connections.Response' &&
        handlerInput.requestEnvelope.request.name === 'Cancel' &&
        handlerInput.requestEnvelope.request.payload.purchaseResult === 'ACCEPTED');
  },
  handle(handlerInput) {
    const speechText = 'Goodbye!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    console.log(`Error stack: ${error.stack}`);
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

    try {
      return handlerInput.responseBuilder
        .speak(requestAttributes.t('ERROR_MESSAGE'))
        .reprompt(requestAttributes.t('ERROR_MESSAGE'))
        .getResponse();
    } catch (err) {
      console.log(`The ErrorHandler encountered an error: ${err}`);
      // this is fixed text because it handles the scenario where the i18n doesn't work correctly
      const speakOutput = 'This skill encountered an error.  Please contact the developer.';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }
  },
};


function getRandom(min, max) {
  return Math.floor((Math.random() * ((max - min) + 1)) + min);
}

function getRandomActor(currentActor) {
  console.log(`CURRENT ACTOR = ${currentActor}`);
  switch (currentActor.toString()) {
    case '1': case '13': case '31':
      console.log('RETURN 2.');
      return 2;
    case '2': case '12': case '21':
      console.log('RETURN 3.');
      return 3;
    case '3': case '23': case '32':
      console.log('RETURN 1.');
      return 1;
    default:
      // should not get here
      console.log('RETURN 0');
      return 0;
  }
}

async function useHint(handlerInput) {
  const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

  sessionAttributes.hintsAvailable -= 1;
  persistentAttributes.hintsUsed += 1;
  handlerInput.attributesManager.savePersistentAttributes();
}

function getClue(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const requestAttributes = handlerInput.attributesManager.getRequestAttributes();

  const show = sessionAttributes.currentShow;
  const actors = sessionAttributes.currentActors;
  if (show === undefined || actors === undefined) return requestAttributes.t('ARE_YOU_READY');

  // actors is an array of numbers so the clues can be randomized, but kept in the same order
  const actor = actors.split('');

  switch (actor.length) {
    case 1:
      return requestAttributes.t('GAME_QUESTION_1_CLUE', show['actor' + actor[0]]);
    case 2:
      return requestAttributes.t('GAME_QUESTION_2_CLUES', show['actor' + actor[0]], show['actor' + actor[1]]);
    case 3:
      return requestAttributes.t('GAME_QUESTION_3_CLUES', show['actor' + actor[0]], show['actor' + actor[1]], show['actor' + actor[2]]);
    default:
      // should not get here...
      console.log('ERROR: invalid number of clues.');
      return '';
  }
}

function isErSuccessMatch(slot, handlerInput) {
  if ((handlerInput) &&
    (handlerInput.requestEnvelope) &&
    (handlerInput.requestEnvelope.request) &&
    (handlerInput.requestEnvelope.request.intent) &&
    (handlerInput.requestEnvelope.request.intent.slots) &&
    (handlerInput.requestEnvelope.request.intent.slots[slot]) &&
    (handlerInput.requestEnvelope.request.intent.slots[slot].resolutions) &&
    (handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0]) &&
    (handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0].status) &&
    (handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0].status.code) &&
    (handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0].status.code === 'ER_SUCCESS_MATCH')) return true;
  return false;
}

async function checkInventory(handlerInput) {
  const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  if (persistentAttributes.hintsUsed === undefined) persistentAttributes.hintsUsed = 0;
  if (persistentAttributes.hintsPurchased === undefined) persistentAttributes.hintsPurchased = 0;

  const ms = handlerInput.serviceClientFactory.getMonetizationServiceClient();

  return ms.getInSkillProducts(handlerInput.requestEnvelope.request.locale).then((res) => {
    if (res.inSkillProducts.length > 0) {
      const hintpack = res.inSkillProducts[0];

      // x5 because each purchase contains five hints.
      const hintsPurchased = (hintpack.activeEntitlementCount * 5);
      // Will differ per skill/product implementation

      if (persistentAttributes.hintsPurchased > hintsPurchased) {
        // THIS CAN HAPPEN IF A CUSTOMER RETURNS AN ACCIDENTAL PURCHASE.
        // YOU SHOULD RESET THEIR TOTALS TO REFLECT THAT RETURN.
        persistentAttributes.hintsPurchased = hintsPurchased;

        if (persistentAttributes.hintsUsed > hintsPurchased) {
          // IF THE USER HAS USED MORE HINTS THAN THEY HAVE PURCHASED,
          // SET THEIR TOTAL "USED" TO THE TOTAL "PURCHASED."
          persistentAttributes.hintsUsed = hintsPurchased;
        }
      } else if (persistentAttributes.hintsPurchased < hintsPurchased) {
        // THIS SHOULDN'T HAPPEN UNLESS WE FORGOT TO MANAGE OUR INVENTORY PROPERLY.
        persistentAttributes.hintsPurchased = hintsPurchased;
      }
    }

    sessionAttributes.hintsAvailable = persistentAttributes.hintsPurchased
      - persistentAttributes.hintsUsed;
    handlerInput.attributesManager.savePersistentAttributes();
  });
}

// Finding the locale of the user
const LocalizationInterceptor = {
  process(handlerInput) {
    const localizationClient = i18n.use(sprintf).init({
      lng: handlerInput.requestEnvelope.request.locale,
      resources: languageStrings,
    });
    localizationClient.localize = function localize() {
      const args = arguments;
      const values = [];
      for (let i = 1; i < args.length; i += 1) {
        values.push(args[i]);
      }
      const value = i18n.t(args[0], {
        returnObjects: true,
        postProcess: 'sprintf',
        sprintf: values,
      });
      if (Array.isArray(value)) {
        return value[Math.floor(Math.random() * value.length)];
      }
      return value;
    };
    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function translate(...args) {
      return localizationClient.localize(...args);
    };
  },
};

const LogIncomingRequestInterceptor = {
  async process(handlerInput) {
    console.log(`REQUEST ENVELOPE = ${JSON.stringify(handlerInput.requestEnvelope)}`);
  },
};

const CheckInventoryInterceptor = {
  async process(handlerInput) {
    await checkInventory(handlerInput);
  },
};


const skillBuilder = Alexa.SkillBuilders.standard();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    HelpIntentHandler,
    YesIntentHandler,
    AnswerHandler,
    HintHandler,
    BuyHintHandler,
    BuyHintResponseHandler,
    CancelPurchaseHandler,
    IDontKnowHandler,
    HintInventoryHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .addRequestInterceptors(
    LogIncomingRequestInterceptor,
    LocalizationInterceptor,
    CheckInventoryInterceptor,
  )
  .withTableName('NameTheShow')
  .withAutoCreateTable(true)
  .lambda();
