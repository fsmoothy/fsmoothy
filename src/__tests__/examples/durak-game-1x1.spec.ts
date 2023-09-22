import { describe, expect, it } from 'vitest';

import {
  StateMachine,
  t,
  IStateMachineParameters,
  nested,
  IStateMachine,
  All,
} from '../..';

interface ICard {
  rank: Rank;
  suit: Suit;
}

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6';

type NPlayerTurn = `player${number}Turn`;

enum DurakGameState {
  waitingForPlayers = 'waitingForPlayers',
  dealing = 'dealing',
  drawing = 'drawing',
  playerOneDraw = 'playerOneDraw',
  playerTwoDraw = 'playerTwoDraw',
  playerOneTurn = 'playerOneTurn',
  playerTwoTurn = 'playerTwoTurn',
  finished = 'finished',
}

enum DurakGameEvent {
  deal = 'deal',
  draw = 'draw',
  start = 'start',
  nextPlayer = 'nextPlayer',
  nextTurn = 'nextTurn',
  finish = 'finish',
}

enum PlayerTurnState {
  waiting = 'waiting',
  attacking = 'attacking',
  defending = 'defending',
}

enum PlayerTurnEvent {
  attack = 'attack',
  defend = 'defend',
  wait = 'wait',
  pass = 'pass',
  beat = 'beat',
  take = 'take',
  drawCard = 'drawCard',
  putCard = 'putCard',
}

interface IPlayerTurnContext {
  id: 'playerTurn';
  hand: Array<ICard>;
}

interface IDurakGameContext {
  id: 'durakGame';
  deck: Array<ICard>;
  board: Array<ICard>;
  trump: Suit;
}

type GameState = NPlayerTurn | DurakGameState | PlayerTurnState;
type GameEvent = DurakGameEvent | PlayerTurnEvent;
type GameContext = IDurakGameContext | IPlayerTurnContext;

type DurakGameFSM = IStateMachine<GameState, GameEvent, GameContext>;

async function drawToFullHand(this: DurakGameFSM, context: IDurakGameContext) {
  if (this.child.context.id !== 'playerTurn') {
    return;
  }

  const playerHand = this.child.context.hand;

  for (let index = playerHand.length; index < 6; index++) {
    await this.child.transition(PlayerTurnEvent.drawCard, context.deck.pop());
  }
}

const buildPlayerTurnFSM = (player: number) => {
  return nested<PlayerTurnState, PlayerTurnEvent, IPlayerTurnContext>({
    id: `player${player}Turn`,
    initial: PlayerTurnState.waiting,
    ctx() {
      return {
        id: 'playerTurn',
        hand: [],
      };
    },
    transitions: [
      t(
        [
          PlayerTurnState.waiting,
          PlayerTurnState.attacking,
          PlayerTurnState.defending,
        ],
        PlayerTurnEvent.wait,
        PlayerTurnState.waiting,
      ),
      t(
        PlayerTurnState.waiting,
        PlayerTurnEvent.drawCard,
        PlayerTurnState.waiting,
        {
          guard(context: IPlayerTurnContext) {
            return context.hand.length <= 6;
          },
          onExit(context: IPlayerTurnContext, card: ICard) {
            context.hand.push(card);
          },
        },
      ),
      t(
        PlayerTurnState.waiting,
        PlayerTurnEvent.attack,
        PlayerTurnState.attacking,
      ),
      t(
        PlayerTurnState.attacking,
        PlayerTurnEvent.putCard,
        PlayerTurnState.attacking,
        {
          guard(context: IPlayerTurnContext, card: ICard) {
            return context.hand.some(
              (_card) => card.rank === _card.rank && card.suit === _card.suit,
            );
          },
          onExit(
            context: IPlayerTurnContext,
            card: ICard,
            board: Array<ICard>,
          ) {
            context.hand.splice(context.hand.indexOf(card), 1);
            board.push(card);
          },
        },
      ),
      t(
        [PlayerTurnState.attacking, PlayerTurnState.defending],
        PlayerTurnEvent.pass,
        PlayerTurnState.waiting,
      ),
      t(
        PlayerTurnState.waiting,
        PlayerTurnEvent.defend,
        PlayerTurnState.defending,
      ),
      t(
        PlayerTurnState.defending,
        PlayerTurnEvent.take,
        PlayerTurnState.waiting,
        {
          onExit(context: IPlayerTurnContext, board: Array<ICard>) {
            context.hand.push(...board);
          },
        },
      ),
    ],
  });
};

const durakGameFSMParameters: IStateMachineParameters<
  GameState,
  GameEvent,
  IDurakGameContext
> = {
  id: 'durakGame',
  ctx() {
    return {
      id: 'durakGame',
      board: [],
      deck: [],
      trump: 'hearts',
    };
  },
  initial: DurakGameState.waitingForPlayers,
  transitions: [
    t(
      DurakGameState.waitingForPlayers,
      DurakGameEvent.deal,
      DurakGameState.dealing,
      {
        onEnter(context: IDurakGameContext, deck: Array<ICard>) {
          context.deck = deck;
          context.trump = deck.at(-1)?.suit ?? context.trump;
        },
      },
    ),
    t(
      DurakGameState.dealing,
      DurakGameEvent.nextPlayer,
      DurakGameState.playerOneDraw,
      {
        onExit: drawToFullHand,
      },
    ),
    t(
      DurakGameState.playerOneDraw,
      DurakGameEvent.nextPlayer,
      DurakGameState.playerTwoDraw,
      {
        onExit: drawToFullHand,
      },
    ),
    t(
      DurakGameState.playerTwoDraw,
      DurakGameEvent.start,
      DurakGameState.playerOneTurn,
      {
        async onExit(this: DurakGameFSM) {
          await this.child.transition(PlayerTurnEvent.attack);
        },
      },
    ),
    t(
      DurakGameState.playerOneTurn,
      DurakGameEvent.nextPlayer,
      DurakGameState.playerTwoTurn,
      {
        async onExit(this: DurakGameFSM) {
          await this.child.transition(PlayerTurnEvent.defend);
        },
      },
    ),
    t(
      DurakGameState.playerTwoTurn,
      DurakGameEvent.nextPlayer,
      DurakGameState.playerOneTurn,
    ),
    t(
      [DurakGameState.playerOneTurn, DurakGameState.playerTwoTurn],
      DurakGameEvent.draw,
      DurakGameState.drawing,
    ),
    t(
      DurakGameState.drawing,
      DurakGameEvent.nextPlayer,
      DurakGameState.playerOneDraw,
      {
        onExit: drawToFullHand,
      },
    ),
    t(
      DurakGameState.playerOneDraw,
      DurakGameEvent.nextTurn,
      DurakGameState.playerOneTurn,
      {
        async onExit(this: DurakGameFSM) {
          await this.child.transition(PlayerTurnEvent.attack);
        },
      },
    ),
    t(All, DurakGameEvent.finish, DurakGameState.finished),
  ],
  states: () => {
    const firstPlayerTurnFSM = buildPlayerTurnFSM(1);
    const secondPlayerTurnFSM = buildPlayerTurnFSM(2);

    return {
      [DurakGameState.playerOneTurn]: firstPlayerTurnFSM,
      [DurakGameState.playerTwoTurn]: secondPlayerTurnFSM,
      [DurakGameState.playerOneDraw]: firstPlayerTurnFSM,
      [DurakGameState.playerTwoDraw]: secondPlayerTurnFSM,
    };
  },
};

const buildDeck = () => {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
  const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6'] as const;

  const deck: Array<ICard> = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        suit,
        rank,
      });
    }
  }

  return deck;
};

describe('Durak game FSM', () => {
  it('should be able to start game', async () => {
    const durakGameFSM = new StateMachine(durakGameFSMParameters);

    await durakGameFSM.deal(buildDeck());
    expect(durakGameFSM.isDealing()).toBeTruthy();

    await durakGameFSM.nextPlayer();
    expect(durakGameFSM.isPlayerOneDraw()).toBeTruthy();

    await durakGameFSM.nextPlayer();
    expect(durakGameFSM.isPlayerTwoDraw()).toBeTruthy();

    await durakGameFSM.start();
    expect(durakGameFSM.isPlayerOneTurn()).toBeTruthy();

    expect(durakGameFSM.context.deck.length).toBe(36 - 12);
    expect(durakGameFSM.context.trump).toBe('spades');
  });

  it('should be able to play game', async () => {
    const durakGameFSM = new StateMachine(durakGameFSMParameters);

    await durakGameFSM.deal(buildDeck());
    await durakGameFSM.nextPlayer();
    await durakGameFSM.nextPlayer();
    await durakGameFSM.start();

    expect(durakGameFSM.isPlayerOneTurn()).toBeTruthy();
    expect(durakGameFSM.isAttacking()).toBeTruthy();

    await durakGameFSM.putCard(
      {
        rank: '6',
        suit: 'spades',
      },
      durakGameFSM.context.board,
    );
    await durakGameFSM.nextPlayer();

    expect(durakGameFSM.isDefending()).toBeTruthy();
    await durakGameFSM.take(durakGameFSM.context.board);
    await durakGameFSM.nextPlayer();
    await durakGameFSM.pass();
    await durakGameFSM.draw();
    await durakGameFSM.nextPlayer();

    await durakGameFSM.nextTurn();
    expect(durakGameFSM.isAttacking()).toBeTruthy();
    await durakGameFSM.pass();
    await durakGameFSM.nextPlayer();
    await durakGameFSM.pass();

    await durakGameFSM.finish();
    expect(durakGameFSM.isFinished()).toBeTruthy();
  });
});
