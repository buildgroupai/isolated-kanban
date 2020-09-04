<template>
  <div id="app">
    <b-form-select
      v-model="limit"
      :options="options"
      class="select"
    ></b-form-select>
    <DealFlowKanban
      :cards="normalizedCards"
      :swimlanes="getShowInKanbanSwimlanes"
      :user="user"
      :users="organizationUsers"
      :qualificationChecklists="qualificationChecklists"
      :backlog="backlog"
      @move="move"
      @drop="drop"
      @drop-opportunity="dropOpportunity"
      @reject-opportunity="rejectOpportunity"
      class="dealflowKanban"
      v-if="shouldRenderKanban"
    />
    <div class="spinnerContainer" v-if="fetching">
      <div class="spinner"></div>
    </div>
  </div>
</template>

<script>
import { debounce } from "lodash";
import { BFormSelect } from "bootstrap-vue";

import request from "@/core/api/request";

import DealFlowKanban from "./components/DealFlowKanban.vue";

import USER_DATA from "./data/user";
import ORGANIZATION_USERS from "./data/organizationUsers";
import QUALIFICATION_CHECKLISTS from "./data/qualificationChecklists";
import BACKLOG from "./data/backlog";

export default {
  name: "App",
  components: {
    DealFlowKanban,
    BFormSelect
  },
  async created() {
    console.log("Created", {
      USER_DATA,
      ORGANIZATION_USERS,
      QUALIFICATION_CHECKLISTS,
      BACKLOG
    });
    const [kanban, cards] = await Promise.all([
      this.getKanban(),
      this.getCards()
    ]);
    this.kanban = kanban;
    this.cards = cards;
    this.fetching = false;
  },
  data() {
    return {
      cards: [],
      swimlanes: [],
      kanban: {},
      limit: 2500,
      fetching: true,
      options: [
        {
          value: null,
          text: "Select the amount of cards to display"
        },
        {
          value: 100,
          text: "Cards amount: 100"
        },
        {
          value: 500,
          text: "Cards amount: 500"
        },
        {
          value: 1000,
          text: "Cards amount: 1000"
        },
        {
          value: 1500,
          text: "Cards amount: 1500"
        },
        {
          value: 2000,
          text: "Cards amount: 2000"
        },
        {
          value: 2500,
          text: "Cards amount: 2500"
        }
      ],
      user: USER_DATA,
      organizationUsers: ORGANIZATION_USERS,
      qualificationChecklists: QUALIFICATION_CHECKLISTS,
      backlog: BACKLOG
    };
  },
  computed: {
    getAllSwimlanes() {
      const kanban = this.kanban;
      if (!kanban.length) return [];
      return kanban[0].swimlanes;
    },
    getShowInKanbanSwimlanes() {
      if (!this.getAllSwimlanes.length) return [];
      return this.getAllSwimlanes.filter(swimlane => swimlane.show_in_kanban);
    },
    normalizedCards() {
      return this.cards.filter(card => {
        return card.current_swimlane.show_in_kanban;
      });
    },
    hasCards() {
      return this.normalizedCards.length;
    },
    hasSwimlanes() {
      return this.getAllSwimlanes.length;
    },
    shouldRenderKanban() {
      return this.hasSwimlanes && this.hasCards && !this.fetching;
    }
  },
  watch: {
    limit: debounce(function() {
      if (!this.limit) return;
      this.refresh();
    }, 500)
  },
  methods: {
    async refresh() {
      this.fetching = true;
      const cards = await this.getCards();
      this.cards = cards;
      this.fetching = false;
    },
    async getKanban() {
      const kanban = await request("dealflow/kanban");
      return kanban.data.results;
    },
    async getCards() {
      const cards = await request("dealflow/kanban-card", {
        params: {
          status: "ALIVE",
          is_deleted: false,
          limit: this.limit
        }
      });
      return cards.data.results;
    },
    async move({ id, position }) {
      await request.post(`dealflow/kanban/cards/${id}/move`, {
        position
      });
    },
    async drop({ id, position, swimlane_id }) {
      const {
        data: [updatedCard]
      } = await request.get(
        `dealflow/kanban-card/${id}/drop/${swimlane_id}/pos/${position}`
      );
      this.cards = this.cards.filter(card => card.id !== updatedCard.id);
      this.cards = [...this.cards, updatedCard];
    },
    async dropOpportunity({ id, reason }) {
      await request.post(`dealflow/kanban/cards/${id}/drop-opportunity/`, {
        reason
      });
    },
    async rejectOpportunity({ id, reason }) {
      await request.post(`dealflow/kanban/cards/${id}/reject-opportunity/`, {
        reason
      });
    }
  }
};
</script>

<style lang="scss">
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  height: 100vh;
  box-sizing: border-box;
  padding: 20px;
  background-color: #cccccc;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
}

.dealflowKanban {
  width: 100vw;
  padding: 0px 16px;
}

.spinnerContainer {
  width: 100%;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.spinner {
  height: 20vh;
  width: 20vh;
  border: 12px solid rgba(0, 174, 239, 0.2);
  border-top-color: rgba(0, 174, 239, 0.8);
  border-radius: 100%;
  animation: rotation 0.6s infinite linear 0.25s;
  opacity: 0;
}

.select {
  margin-bottom: 20px;
  max-width: 500px;
}

@keyframes rotation {
  from {
    opacity: 1;
    transform: rotate(0deg);
  }
  to {
    opacity: 1;
    transform: rotate(359deg);
  }
}
</style>
