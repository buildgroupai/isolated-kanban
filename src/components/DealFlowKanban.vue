<i18n>
{
  "en": {
    "messages": {
      "checklistCreationSuccess": "Checklist added to",
      "checklistCreationError": "There was an error adding a Checklist to"
    },
    "checklist": {
      "qualificationCriteria": "Qualification Criteria",
      "comments": "Comments",
      "nextSteps": "Next Steps"
    }
  }
}
</i18n>

<template>
  <div class="kanban" />
</template>

<script>
import { chain } from "lodash";
import "@xbs/webix-pro/webix.css";
import "@xbs/kanban/kanban.css";

import * as webix from "@xbs/webix-pro";
import "@xbs/kanban";
import numeral from "numeral";
import {
  difference,
  differenceBy,
  intersectionBy,
  upperFirst,
  isNil,
  debounce
} from "lodash";
import { DateTime } from "luxon";

import { Alert } from "@/core/notification";
import { truncate } from "@/core/string/truncate";

const STATUS = ["sel", "sql", "opt", "pro", "ts1", "ts2", "ts3", "ts4", "ts5"];

export default {
  name: "DealFlowKanban",
  props: {
    cards: {
      type: Array,
      default: () => []
    },
    swimlanes: {
      type: Array,
      required: true
    },
    user: {
      type: Object,
      required: true
    },
    users: {
      type: Array,
      required: true
    },
    qualificationChecklists: {
      type: Array,
      required: true
    },
    backlog: {
      type: Array,
      required: true
    }
  },
  data() {
    return {
      kanban: null,
      resizeObserver: null,
      defaultFields: [
        "name",
        "days_since_last_funding",
        "raised_amount",
        "country_code",
        "description",
        "lead_score",
        "mbm_score",
        "qualification_score",
        "avatar",
        "comments",
        "markets",
        "is_manual_creation"
      ],
      kanbanCards: []
    };
  },
  computed: {
    normalizedCards() {
      return this.cards
        .filter(
          item =>
            item.status === "ALIVE" &&
            !item.is_deleted &&
            STATUS.some(
              status =>
                item.current_swimlane.short_name.toLowerCase() === status
            )
        )
        .map(item => this.normalizeCard(item));
    },
    allSwimlanes() {
      return this.swimlanes.find(
        kanban => kanban.organization === this.user.organizations[0]
      );
    },
    cols() {
      return this.swimlanes.map(swimlane => {
        return {
          id: `${swimlane.id}-accordion`,
          header: `${swimlane.short_name} (${swimlane.num_of_cards_alive})`,
          width: swimlane.column_width,
          collapsed: swimlane.initial_state === "COLLAPSED",
          onClick: {
            "collapse-icon": this.onKanbanCollapse,
            "expand-icon": this.onKanbanExpand
          },
          body: {
            view: "kanbanlist",
            type: "cards",
            id: swimlane.id,
            droppable: swimlane.droppable,
            status: swimlane.short_name.toLowerCase(),
            comments: true
          }
        };
      });
    },
    orderedChecklists() {
      if (!this.checklists) {
        return [];
      }

      return chain(this.checklists)
        .sortBy(checklist => checklist.name, "desc")
        .value();
    }
  },
  watch: {
    normalizedCards: debounce(
      function() {
        if (!this.kanban) {
          return;
        }

        const cardsDifference = differenceBy(
          this.normalizedCards,
          this.kanbanCards,
          "id"
        );
        const cardsIntersection = intersectionBy(
          this.normalizedCards,
          this.kanbanCards,
          "id"
        );
        const kanbanDifference = differenceBy(
          this.kanbanCards,
          this.normalizedCards,
          "id"
        );

        this.kanbanCards = [...this.normalizedCards];

        this.kanban.blockEvent();

        cardsDifference.forEach(card => this.kanban.add(card));
        cardsIntersection.forEach(card =>
          this.kanban.updateItem(card.id, {
            ...card,
            $index: null,
            $css: ""
          })
        );
        kanbanDifference.forEach(card => this.kanban.remove(card.id));

        this.kanban.sort({ by: "title", dir: "asc", as: "string" });
        this.kanban.unblockEvent();
        this.kanban.refresh();
      },
      500,
      { maxWait: 1000 }
    ),
    swimlanes() {
      if (!this.kanban) {
        return;
      }
      this.swimlanes.forEach(swimlane => {
        const accordion = webix.$$(`${swimlane.id}-accordion`);
        accordion.define(
          "header",
          `${swimlane.short_name} (${swimlane.num_of_cards_alive})`
        );
        accordion.refresh();
      });
    },
    offline() {
      if (this.offline && this.kanban) {
        this.kanban.refresh();
      }
    }
  },
  async mounted() {
    this.kanbanCards = [...this.normalizedCards];
    webix.type(webix.ui.kanbanlist, {
      name: "cards",
      icons: [
        {
          id: "comments",
          icon: "webix_kanban_icon kbi-comment",
          show(obj, kanban) {
            return !!kanban.config.comments;
          },
          template(obj) {
            return obj.comments ? obj.comments.length || "" : "";
          }
        }
      ],
      template: this.template,
      templateBody: this.templateBody,
      templateTags: this.templateTags,
      templateIcons: this.templateIcons,
      templateAvatar: this.templateAvatar
    });
    webix.i18n.kanban.menu.assignChecklist = "Assign Checklist";
    webix.i18n.kanban.menu.assign = "Assign to";
    webix.i18n.kanban.menu.changeStage = "Change stage";
    webix.i18n.kanban.menu.dropOpportunity = "Drop opportunity";
    webix.i18n.kanban.menu.invite = "Invite";
    webix.i18n.kanban.menu.reject = "Reject";
    webix.i18n.kanban.menu.ownership = "Take ownership";

    this.kanban = webix.ui({
      view: "kanban",
      id: "kanban",
      height: 600,
      width: 800,
      margin: 10,
      borderless: true,
      $scope: this,
      container: this.$el,
      cardActions: [
        "assignChecklist",
        "assign",
        "changeStage",
        "dropOpportunity",
        "invite",
        "reject",
        "ownership"
      ],
      cols: this.cols,
      users: this.users,
      comments: {
        currentUser: this.user.id
      },
      datetype: "jsarray",
      data: this.kanbanCards,
      on: {
        onBeforeCardAction: this.onCardAction,
        onListBeforeDrop: this.onDrop,
        onListBeforeDrag: this.onDrag,
        onListBeforeDragIn: this.onDragIn,
        onListItemDblClick: this.onCardClick
      },
      scheme: {
        $sort: {
          by: "title",
          dir: "asc",
          as: "string"
        }
      }
    });

    this.addInterceptors();
    this.addHeaderButtons();
    this.addResizeObserver();
    this.addClickListener();
  },
  destroyed() {
    if (this.kanban) {
      this.kanban.destructor();
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  },
  methods: {
    addInterceptors() {
      this.addAccordionItemInterceptor();
    },
    addAccordionItemInterceptor() {
      this.$el.querySelectorAll(".webix_accordionitem_header").forEach(node => {
        node.addEventListener("click", e => {
          const target = e.target;

          // TODO It's possibile to intercept the original event throught the Webix API?
          if (!["expand-icon", "collapse-icon"].includes(target.className)) {
            e.stopPropagation();
          }
        });
      });
    },
    normalizeCard(card) {
      const fields = this.getCardFields(card.current_swimlane);

      return {
        id: card.id,
        user_id: card.owner && card.owner,
        title: card.company && card.company.name,
        description: card.company && card.company.description,
        status: card.current_swimlane.short_name.toLowerCase(),
        logo: card.company && card.company.company_logo,
        tags: card.company && card.company.specialities,
        fields,
        card: card,
        qualification_score: card && card.qualification_checklist_score
      };
    },
    addHeaderButtons() {
      const buttons = this.$el.querySelectorAll(".webix_accordionitem_button");

      buttons.forEach(button => {
        const expand = document.createElement("i");
        expand.title = "Expand";
        expand.className = "expand-icon";

        const collapse = document.createElement("i");
        collapse.title = "Collapse";
        collapse.className = "collapse-icon";

        button.appendChild(expand);
        button.appendChild(collapse);
      });
    },
    addResizeObserver() {
      this.resizeObserver = new ResizeObserver(entries => {
        entries.forEach(entry => {
          const { height, width } = entry.contentRect;

          if (!height && !width) {
            return;
          }

          this.kanban.define("width", width);
          this.kanban.define("height", height);
          this.kanban.resize();
        });
      });
      this.resizeObserver.observe(this.$el);
    },
    addClickListener() {
      const node = this.$el;
      node.addEventListener("click", this.onCompanyLinkClick, false);
    },
    onKanbanCollapse(event, id, object) {
      const accordionItem = webix.$$(id);

      if (accordionItem.config.collapsed) {
        accordionItem.expand();
      } else {
        accordionItem.collapse();
      }

      return webix.html.preventEvent(object);
    },
    onKanbanExpand(event, id, object) {
      const accordionItem = webix.$$(id);
      accordionItem.expand();

      document.querySelectorAll(".webix_accordionitem").forEach(node => {
        const viewId = node.getAttribute("view_id");
        const anotherAccordionItem = webix.$$(viewId);

        if (viewId !== id) {
          anotherAccordionItem.collapse();
        }
      });

      return webix.html.preventEvent(object);
    },
    onCardAction(action, id) {
      const eventHandler = this[`on${upperFirst(action)}`];

      if (eventHandler) {
        eventHandler(id);
      }
    },
    async onDrop(context) {
      const fromSwimlane = context.from.config.id;
      const toSwimlane = context.to.config.id;

      const card = this.normalizedCards.find(card => card.id === context.start);
      const position = context.index;

      this.kanban.updateItem(card.id, { ...card, $css: "none" });
      this.kanban.refresh(card.id);

      if (fromSwimlane === toSwimlane && card.order !== position) {
        try {
          await this.$listeners.move({ id: card.id, position });
          const alert = new Alert(this);
          alert.success(`You have changed the position for ${card.title}`);
        } catch (err) {
          const alert = new Alert(this);
          alert.error(
            `There was an error changing the position for ${card.title}`
          );
        }
      } else if (fromSwimlane !== toSwimlane) {
        try {
          await this.$listeners.drop({
            id: card.id,
            position,
            swimlane_id: toSwimlane
          });
          const item = this.kanban.getItem(card.id);
          if (!item.user_id) {
            this.onOwnership(card.id);
          }
          const alert = new Alert(this);
          alert.success(`You have changed the stage for ${card.title}`);
        } catch (err) {
          const alert = new Alert(this);
          alert.error(
            `There was an error changing the stage for ${card.title}`
          );
        }
      }
    },
    onDrag() {
      return !this.offline;
    },
    onDragIn(context) {
      const fromSwimlane = context.from.config.id;
      const toSwimlane = context.to.config.id;
      const droppable = context.to.config.droppable;

      if (fromSwimlane !== toSwimlane && !droppable) {
        return false;
      } else if (fromSwimlane === toSwimlane) {
        return false;
      }

      return true;
    },
    onCardClick(id) {
      const card = this.kanban.getItem(id);
      this.$router
        .push({ name: "Profile", params: { id: card.card.company.company_id } })
        .catch(() => ({}));
    },
    onCompanyLinkClick(event) {
      const target = event.target;
      const targetClasses = target.getAttribute("class");

      if (targetClasses && targetClasses.includes("company-link")) {
        event.preventDefault();
        const companyId = target.dataset.companyId;

        this.$router
          .push({ name: "Profile", params: { id: companyId } })
          .catch(() => ({}));
      }

      if (targetClasses && targetClasses.includes("kanban-ellipsis")) {
        event.preventDefault();
        const cardId = target.dataset.cardId;
        this.onMenu(cardId, event);
      }
    },
    onMenu(id, e) {
      if (this.offline) {
        return;
      }

      const menu = this.kanban.getMenu();
      const item = this.kanban.getItem(id);

      const dropOpportunitySubmenu = [
        "Not interested",
        "Not responded",
        "Not right",
        "Too early",
        "Too late"
      ];
      const dropOpportunity = menu.getItem("dropOpportunity");
      dropOpportunity.submenu = dropOpportunitySubmenu;

      const reject = menu.getItem("reject");
      reject.submenu = ["I'm not interested in", "It's not the right time"];

      if (item.user_id === this.user.id) {
        menu.disableItem("ownership");
      } else {
        menu.enableItem("ownership");
      }

      if (!item.card.current_swimlane.is_system) {
        menu.hideItem("reject");
        menu.showItem("dropOpportunity");
      } else {
        menu.showItem("reject");
        menu.hideItem("dropOpportunity");
      }

      if (
        isNil(item.card.qualification_checklist) &&
        !item.card.current_swimlane.is_system
      ) {
        menu.showItem("assignChecklist");
      } else {
        menu.hideItem("assignChecklist");
      }

      menu.define({
        submenuConfig: {
          width: 160,
          $scope: this,
          click(reason) {
            if (dropOpportunitySubmenu.includes(reason)) {
              this.$scope.onDropOpportunity(item, reason);
            } else {
              this.$scope.onRejectOpportunity(item, reason);
            }
          }
        }
      });
      menu.setContext({
        id
      });
      menu.show(e);
    },
    getChecklists() {
      return this.qualificationChecklists;
    },
    onAssignChecklist(id) {
      const card = this.normalizedCards.find(card => card.id === id);

      const data = this.orderedChecklists.map(checklist => {
        return {
          id: checklist.id,
          value: checklist.name,
          checklist: checklist
        };
      });

      const contextmenu = webix.ui({
        view: "contextmenu",
        data,
        click: checklist => this.onAssignChecklistClick(card, checklist)
      });

      const kanban = webix.$$("kanban");

      const kanbanmenu = kanban.getMenu();
      contextmenu.show({
        y: kanbanmenu.config.top,
        x: kanbanmenu.config.left
      });
    },
    onAssignChecklistClick(card, checklist) {
      console.log(card, checklist);
      // const selectedChecklist = this.orderedChecklists.find(
      //   cl => cl.id === checklist
      // );
      // const newValues = selectedChecklist.items.map(item => {
      //   return {
      //     metric_id: item.id,
      //     metric_name: item.name,
      //     company_value: "",
      //     comment: "",
      //     assessment: null
      //   };
      // });
      // const newQualificationChecklist = {
      //   card_id: card.id,
      //   checklist_id: selectedChecklist.id,
      //   values: newValues,
      //   comments: "",
      //   comments_checked: false,
      //   next_steps: "",
      //   next_steps_checked: false
      // };
      // this.$store
      //   .dispatch("api/createQualificationChecklist", newQualificationChecklist)
      //   .then(() => {
      //     const alert = new Alert(this);
      //     alert.success(
      //       `${this.$t("messages.checklistCreationSuccess")} ${
      //         card.card.company.name
      //       }`
      //     );
      //     setTimeout(() => {
      //       this.$router.push({
      //         name: "Profile",
      //         params: { id: card.card.company.company_id, currentTab: 1 }
      //       });
      //     }, 3000);
      //   })
      //   .catch(() => {
      //     const alert = new Alert(this);
      //     alert.error(
      //       `${this.$t("messages.checklistCreationError")} ${
      //         card.card.company.name
      //       }`
      //     );
      //   });
    },
    onChangeStage(id) {
      const card = this.normalizedCards.find(card => card.id === id);
      const data = this.allSwimlanes
        .filter(
          swimlane =>
            !swimlane.is_system && card.card.current_swimlane.id !== swimlane.id
        )
        .map(swimlane => {
          return {
            id: swimlane.id,
            value: `${swimlane.name} (${swimlane.short_name})`
          };
        });

      const contextmenu = webix.ui({
        view: "contextmenu",
        data,
        click: swimlaneId => this.onChangeStageClick(card, swimlaneId)
      });

      const kanban = webix.$$("kanban");

      const kanbanmenu = kanban.getMenu();
      contextmenu.show({
        y: kanbanmenu.config.top,
        x: kanbanmenu.config.left
      });
    },
    onChangeStageClick(card, swimlaneId) {
      let contextSerialized = {
        from: {
          config: {
            id: card.card.current_swimlane.id
          }
        },
        to: {
          config: {
            id: swimlaneId,
            droppable: true
          }
        },
        start: card.id,
        index: 0
      };
      this.onDrag();
      this.onDragIn(contextSerialized);
      this.onDrop(contextSerialized);
    },
    onInvite(id) {
      const card = this.normalizedCards.find(card => card.id === id);
      const data = chain(this.users)
        .filter(
          user => user.is_active && !card.card.collaborators.includes(user.id)
        )
        .map(user => {
          return {
            id: user.id,
            value: `
            ${
              user.image
                ? ""
                : '<span class="webix_icon webix_kanban_icon kbi-account webix_kanban_list_avatar"></span>'
            }
            ${user.value}
          `
          };
        })
        .orderBy(user => user.value, "asc")
        .value();

      const contextmenu = webix.ui({
        view: "contextmenu",
        data,
        click: userId => this.onInviteClick(card, userId)
      });

      const kanban = webix.$$("kanban");
      const kanbanmenu = kanban.getMenu();
      contextmenu.show({
        y: kanbanmenu.config.top,
        x: kanbanmenu.config.left
      });
    },
    onInviteClick(card, userId) {
      console.log(card, userId);
      // const user = this.users.find(user => user.id === userId);

      // this.$store
      //   .dispatch("api/addCardCollaborator", {
      //     cardId: card.id,
      //     data: { emails: [user.email] }
      //   })
      //   .then(() => {
      //     const alert = new Alert(this);
      //     alert.success(`You have invited ${user.value}`);
      //   })
      //   .catch(() => {
      //     const alert = new Alert(this);
      //     alert.error(`There was an error inviting ${user.value}`);
      //   });
    },
    onOwnership(id) {
      const card = this.normalizedCards.find(card => card.id === id);

      if (this.user.id === card.user_id) {
        return;
      }

      // this.$store
      //   .dispatch("api/assignCardOwner", {
      //     cardId: id,
      //     data: { user_id: this.user.id }
      //   })
      //   .then(() => {
      //     const alert = new Alert(this);
      //     alert.success(`You are now the owner of ${card.title}`);
      //   })
      //   .catch(() => {
      //     const alert = new Alert(this);
      //     alert.error(`There was an error taking ownership of ${card.title}`);
      //   });
    },
    onAssign(id) {
      const card = this.normalizedCards.find(card => card.id === id);
      const data = chain(
        this.users
          .filter(user => user.id !== card.owner && user.is_active)
          .map(user => {
            return {
              id: user.id,
              value: `
              ${
                user.image
                  ? ""
                  : '<span class="webix_icon webix_kanban_icon kbi-account webix_kanban_list_avatar"></span>'
              }
              ${user.value}
            `
            };
          })
      )
        .orderBy(user => user.value, "asc")
        .value();

      const contextmenu = webix.ui({
        view: "contextmenu",
        $scope: this,
        data,
        click(userId) {
          console.log(userId);
          // const user = this.$scope.users.find(user => user.id === userId);

          // this.$scope.$store
          //   .dispatch("api/assignCardOwner", {
          //     cardId: card.id,
          //     data: { user_id: userId }
          //   })
          //   .then(() => {
          //     const alert = new Alert(this.$scope);
          //     alert.success(`You have assigned to ${user.value}`);
          //   })
          //   .catch(() => {
          //     const alert = new Alert(this.$scope);
          //     alert.error(`There was an error assigning ${card.title}`);
          //   });
        }
      });

      const kanbanmenu = this.kanban.getMenu();
      contextmenu.show({
        y: kanbanmenu.config.top,
        x: kanbanmenu.config.left
      });
    },
    async onDropOpportunity(card, reason) {
      if (reason) {
        try {
          await this.$listeners["drop-opportunity"]({
            id: card.id,
            reason
          });
          const alert = new Alert(this);
          alert.success(`${card.title} status has been changed to Dropped`);
        } catch (err) {
          const alert = new Alert(this);
          alert.error(`There was an error dropping ${card.title}`);
        }
      }
    },
    async onRejectOpportunity(card, reason) {
      if (reason) {
        try {
          await this.$listeners["reject-opportunity"]({
            id: card.id,
            reason
          });
          const alert = new Alert(this);
          alert.success(`You have rejected ${card.title}`);
        } catch (err) {
          const alert = new Alert(this);
          alert.error(`There was an error rejecting ${card.title}`);
        }
      }
    },
    template(obj, common) {
      const kanban = webix.$$(common.master);

      const avatar = `
        <div class='webix_kanban_user_avatar' webix_icon_id="$avatar">
          ${common.templateAvatar(obj, common, kanban)}
        </div>
      `;

      const qualificationStatusAdditionalDetailsState =
        obj.card.statistics.qualification_checklist_comments_filled &&
        obj.card.statistics.qualification_checklist_next_steps_filled
          ? "qualification-checklist-additional-details-filled"
          : "qualification-checklist-additional-details-not-filled";

      const qualificationStatusCommentsState = obj.card.statistics
        .qualification_checklist_comments_filled
        ? "qualification-checklist-additional-details-item-filled"
        : "qualification-checklist-additional-details-item-not-filled";

      const qualificationStatusNextStepsState = obj.card.statistics
        .qualification_checklist_next_steps_filled
        ? "qualification-checklist-additional-details-item-filled"
        : "qualification-checklist-additional-details-item-not-filled";

      const qualificationStatus =
        obj.card.statistics.qualification_checklist_existence &&
        !obj.card.statistics.qualification_checklist_completed &&
        obj.fields.includes("qualification_score")
          ? `
        <section class="checklist-status">
          <div class="checklist-status-progress">
            <div role="progressbar" aria-valuemin="0" aria-valuemax="100" class="checklist-status-progress-bar">
              <div class="checklist-status-progress-bar--ok" style="width: ${obj
                .card.statistics
                .qualification_checklist_num_of_accepted_metrics *
                100}%;"></div>
              <div class="checklist-status-progress-bar--not-ok" style="width: ${obj
                .card.statistics
                .qualification_checklist_num_of_rejected_metrics *
                100}%;"></div>
              <div style="width: ${obj.card.statistics
                .qualification_checklist_num_of_pending_metrics * 100}%;"></div>
            </div>
          </div>
          <div class="checklist-status-count"> ${this.$t(
            "checklist.qualificationCriteria"
          )} - ${parseInt(
              obj.card.statistics
                .qualification_checklist_num_of_accepted_metrics +
                obj.card.statistics
                  .qualification_checklist_num_of_rejected_metrics
            )}/ ${obj.card.statistics
              .qualification_checklist_num_of_accepted_metrics +
              obj.card.statistics
                .qualification_checklist_num_of_rejected_metrics +
              obj.card.statistics
                .qualification_checklist_num_of_pending_metrics}
            <div class="checklist-status-count-icon-container" data-direction="bottom">
              <i class="bgds-icon ${qualificationStatusAdditionalDetailsState}"></i>
              <div class="tooltip__item">
                <div class="row d-flex">
                  <span class="checklist-status-count-icon-container mr-2">
                    <i class="bgds-icon ${qualificationStatusCommentsState}" title="Qualification Checklist Additional Detail"></i>
                  </span>
                  <p>${this.$t("checklist.comments")}</p>
                </div>
                <div class="row">
                  <span class="checklist-status-count-icon-container mr-2">
                    <i class="bgds-icon ${qualificationStatusNextStepsState}" title="Qualification Checklist Additional Detail"></i>
                  </span>
                  <p>${this.$t("checklist.nextSteps")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      `
          : "";

      const body = `<div class="webix_kanban_body">
          ${common.templateBody(obj, common, kanban)}
          ${avatar}
        </div>`;
      const attachments = kanban.config.attachments
        ? common.templateAttachments(obj, common, kanban)
        : "";
      const footer = `<div class="webix_kanban_footer">${common.templateFooter(
        obj,
        common,
        kanban
      )}</div>`;

      const leadScore =
        !isNil(obj.card.lead_score) && obj.fields.includes("lead_score")
          ? `
            <div class="lead-score filled progress-${obj.card.lead_score}">
              <span class="label">${obj.card.lead_score}</span>
              <div class="pie">
                <div class="left-side half-circle"></div>
                <div class="right-side half-circle"></div>
              </div>
              <div class="shadow"></div>
            </div>`
          : "";
      const qualificationScore =
        obj.card.statistics.qualification_checklist_existence &&
        obj.fields.includes("qualification_score")
          ? `
            <div class="qualification-score filled progress-${obj.card.qualification_checklist_score}">
              <span class="label">${obj.card.qualification_checklist_score}</span>
              <div class="pie">
                <div class="left-side half-circle"></div>
                <div class="right-side half-circle"></div>
              </div>
              <div class="shadow"></div>
            </div>`
          : "";
      const mbmScore =
        !isNil(obj.card.current_mbm_score) && obj.fields.includes("mbm_score")
          ? `<div class="mbm-score-field filled">
              <span>${parseInt(obj.card.current_mbm_score)}</span>
              <img src="/img/mbm.png" />
            </div>`
          : "";
      const daysSinceLastFunding =
        obj.card.company.days_since_last_funding &&
        obj.fields.includes("days_since_last_funding")
          ? `
            <div class="container-fluid">
              <div class="row">
                <div class="col-sm-4 px-1 text-right">
                  <div class="icon-container">
                    <i class="bgds-icon days-since-last-funding" title="Days since last funding"></i>
                  </div>
                </div>
                <div class="col-sm-8 px-1">
                  <small class="text-white text-center">
                    ${this.toRelativeDate(
                      obj.card.company.days_since_last_funding
                    )}
                  </small>
                </div>
              </div>
            </div>
          `
          : "";
      const raisedAmount =
        obj.card.company.accum_funding_sum &&
        obj.fields.includes("raised_amount")
          ? `
            <div class="container-fluid">
              <div class="row">
                <div class="col-sm-4 px-1 text-right">
                  <div class="icon-container">
                    <i class="bgds-icon raised-amount" title="Raised amount"></i>
                  </div>
                </div>
                <div class="col-sm-8 px-1">
                  <small class="text-white text-center">
                    ${this.toCurrencyAbbreviation(
                      obj.card.company.accum_funding_sum
                    )}
                  </small>
                </div>
              </div>
            </div>
          `
          : "";
      const country =
        obj.card.company.country_code && obj.fields.includes("country_code")
          ? `
            <div class="container-fluid">
              <div class="row">
                <div class="col-sm-4 px-1 text-right">
                  <div class="icon-container">
                    <i class="bgds-icon country" title="Country"></i>
                  </div>
                </div>
                <div class="col-sm-8 px-1">
                  <small class="text-white text-center">${obj.card.company.country_code}</small>
                </div>
              </div>
            </div>
          `
          : "";

      const commentsEnabled = false;
      const comments =
        obj.fields.includes("comments") && commentsEnabled
          ? `<span class="webix_kanban_icon kbi-comment webix_icon"></span>`
          : "";

      const content = `
        <div class="webix_kanban_list_content">
          <div class="kanban_list_content_main">
            ${attachments}
            ${body}
            ${footer}
            ${qualificationStatus}
          </div>
          <div class="kanban_list_content_lateral">
            <span class="kanban-ellipsis" data-card-id="${obj.id}"></span>
            ${mbmScore}
            ${qualificationScore}
            ${leadScore}
            ${daysSinceLastFunding}
            ${raisedAmount}
            ${country}
            ${comments}
          </div>
        </div>
      `;
      return content;
    },
    templateBody(obj) {
      const fields = obj.fields;

      const logo = obj.logo
        ? `<img class="card-logo" width="40" src="${obj.logo}" />`
        : "";
      const linkDisabled = !this.isLinkEnabled(
        `/dashboard/profile/${obj.card.company.company_id}`
      )
        ? "disabled"
        : "";
      const titleLink = `
        <a
          href="#"
          class="company-link ${linkDisabled}"
          data-company-id="${obj.card.company.company_id}"
        >
          ${obj.title}
        </a>
      `;
      const title = obj.title && fields.includes("name") ? titleLink : "";

      const description =
        obj.description && fields.includes("description")
          ? `<small class="d-block font-weight-normal">${truncate(
              obj.description,
              100,
              "...",
              ""
            )}</small>`
          : "";

      const processingTag =
        obj.card.company.is_manual_creation &&
        fields.includes("is_manual_creation")
          ? `<div class="webix_kanban_tag_warning_container"><span class="webix_kanban_tag_warning">Processing</span></div>`
          : "";

      const content = `
        ${logo}
        ${title}
        ${description}
        ${processingTag}
      `;

      return content;
    },
    templateTags(object) {
      const company = object.card.company;
      const tags = (object.tags || [])
        .filter(tag => company.top_speciality !== tag)
        .map(tag => {
          return `<span class="webix_kanban_tag">${tag}</span>`;
        });

      if (company.top_speciality) {
        tags.unshift(
          `<span class="webix_kanban_tag top_tag">${company.top_speciality}</span>`
        );
      }

      return `
        <div class="webix_kanban_tags">${tags.join("")}</div>
      `;
    },
    templateIcons() {
      return "";
    },
    templateAvatar(obj) {
      const { email = "" } =
        this.users.find(({ id }) => id === obj.user_id) || {};
      if (!email) {
        return `<img src="/img/default-avatar.png" class="webix_kanban_avatar" />`;
      }
      // eslint-disable-next-line no-useless-escape
      const userName = email.toLowerCase().replace(/[@\.]/g, "_");
      return `<img src="/img/${userName}.png" class="webix_kanban_avatar" onerror="this.src = '/img/default-avatar.png'" />`;
    },
    getCardFields(swimlane) {
      const included_fields =
        swimlane.included_fields_in_card || this.defaultFields;
      const excluded_fields = swimlane.excluded_fields_in_card;

      return difference(included_fields, excluded_fields);
    },
    toRelativeDate(days) {
      const relative = DateTime.local()
        .minus({ days })
        .toRelative({ round: false });

      return (relative && relative.replace("ago", "")) || null;
    },
    toCurrencyAbbreviation(number) {
      return numeral(number).format("($ 0.00a)");
    },
    isLinkEnabled(route) {
      return !this.offline || this.hasHistory(route);
    }
  }
};
</script>

<style lang="scss">
.kanban {
  &::-webkit-scrollbar-track {
    background: $gray-silver;
  }

  &::-webkit-scrollbar-thumb {
    background: #fff;
  }

  ::-webkit-scrollbar-track {
    background: $gray-silver;
  }

  ::-webkit-scrollbar-thumb {
    background: #fff;
  }
}

.webix_kanban,
.webix_kanban_drag_zone {
  background: none;
  overflow: auto;

  .webix_view.webix_accordionitem.horizontal {
    margin: 0 10px 0 10px !important;
    border-radius: 0.5rem;

    &:first-child {
      margin-left: 0 !important;
    }

    &:last-child {
      margin-right: 0 !important;
    }
  }

  .webix_accordionitem_header {
    cursor: default;
    border: none;
    background-color: $gray-silver;
    color: $primary;

    &:hover {
      background-color: $gray-silver;
    }

    &:focus {
      background-color: $gray-silver;
    }

    &.collapsed {
      background-color: $gray-silver !important;

      .collapse-icon {
        &::after {
          background-image: url(~@/assets/icon/expand_blue_icon.svg) !important;
        }
      }
    }

    .webix_accordionitem_label {
      color: $primary;
    }

    .webix_accordionitem_button {
      width: 50px !important;

      &::before {
        content: none !important;
      }

      .expand-icon {
        cursor: pointer;
        margin-right: 2px;

        &::after {
          width: 20px !important;
          height: 19px !important;
          content: "";
          display: inline-block;
          position: relative;
          background-position: center;
          background-repeat: no-repeat;
          background-size: contain;
          background-image: url(~@/assets/icon/maximize_blue_icon.svg);
        }
      }

      .collapse-icon {
        cursor: pointer;

        &::after {
          width: 20px !important;
          height: 20px !important;
          content: "";
          display: inline-block;
          position: relative;
          background-position: center;
          background-repeat: no-repeat;
          background-size: contain;
          background-image: url(~@/assets/icon/collapse_blue_icon.svg);
        }
      }
    }
  }

  .webix_kanban_list {
    background: $gray-silver;
    position: relative;

    .webix_kanban_list_item:first-child {
      margin-top: 0;
    }

    .webix_drop_area {
      position: absolute;
      top: 0;
      height: 100%;
      width: 100%;
      padding: 0 4px;

      .webix_kanban_drop_inner {
        border: 2px dashed $info;
        border-radius: 0.5rem;
      }
    }
  }

  .webix_kanban_list_item {
    padding: 0 !important;
    cursor: default;
    line-height: normal;
    margin: 6px 4px 6px 4px;
    box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075) !important;
    border-radius: 0.5rem;

    &.webix_selected {
      .webix_kanban_list_content {
        background-color: #fff;
      }
    }

    .webix_kanban_list_content {
      display: flex;
      min-height: 140px;
      border: none !important;
      border-radius: 0.5rem;

      .kanban_list_content_main {
        width: 75%;
        display: flex;
        flex-direction: column;
      }

      .kanban_list_content_lateral {
        display: flex;
        position: relative;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding: 5px 0;
        width: 25%;
        background: $primary;
        border-radius: 0 0.5rem 0.5rem 0;

        .kanban-ellipsis {
          display: inline-block;
          cursor: pointer;
          color: #fff;
          font-size: 17px;
          font-family: "Webix Awesome Icons";
          width: 20px;
          text-align: center;

          &:before {
            content: "\F010";
          }

          &:hover {
            color: $light;
          }
        }

        .kbi-comment {
          color: #fff;

          &:hover {
            color: $light;
          }
        }

        > *:not(:last-child) {
          margin-bottom: 5px;
        }
      }

      .webix_kanban_tag_warning_container {
        margin-top: 0.75rem;
        margin-bottom: 1rem;
        .webix_kanban_tag_warning {
          border: 2px solid $warning;
          border-radius: 5px;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem !important;
          color: $warning;
        }
      }

      .webix_kanban_tags {
        .webix_kanban_tag {
          font-size: x-small;
          line-height: 1.5rem;
          padding: 0px 4px;
          margin: 0px 1px;
          border: 1px solid $gray-silver;
          background-color: #fff;
          color: $dark;
          max-width: 100%;
          text-overflow: ellipsis;
          white-space: nowrap;
          overflow: hidden;

          &:hover {
            background: $gray-silver;
          }
        }

        .top_tag {
          background-color: $gray-silver;
        }
      }
    }
  }

  .webix_kanban_icon {
    cursor: pointer;
  }

  .webix_kanban_user_avatar {
    right: 4px;
    top: 4px;
    line-height: normal;
    width: 28px;
    height: 28px;

    .webix_icon {
      font-size: 26px;
    }
  }
}

.webix_kanban_drag_zone {
  .webix_kanban_list_item {
    .webix_kanban_list_content {
      .kanban_list_content_main {
        width: 100%;
      }

      .kanban_list_content_lateral {
        display: none;
      }
    }
  }
}

.webix_menu {
  .webix_list_item {
    color: $primary;

    &.webix_disabled {
      background-color: $light !important;
      color: $gray-light !important;
    }

    &:hover {
      background-color: $gray-light;
    }
  }
}
</style>

<style lang="scss">
.icon-container {
  display: inline-block;
  width: 15px;
  height: 15px;
  vertical-align: middle;
}

.bgds-icon {
  display: inline-block;
  content: "";
  width: 100%;
  height: 100%;

  &::after {
    content: "";
    white-space: nowrap;
    display: inline-block;
    position: relative;
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
    width: 100%;
    height: 100%;
  }

  &.days-since-last-funding {
    &::after {
      background-image: url(~@/assets/icon/months_since_funding_white_icon.svg);
    }
  }

  &.qualification-checklist-additional-details-not-filled {
    &::after {
      background-image: url(~@/assets/icon/exclamation-circle-red.svg);
    }
  }

  &.qualification-checklist-additional-details-filled {
    &::after {
      background-image: url(~@/assets/icon/check-circle-green.svg);
    }
  }

  &.qualification-checklist-additional-details-item-not-filled {
    &::after {
      background-image: url(~@/assets/icon/times-red.svg);
    }
  }

  &.qualification-checklist-additional-details-item-filled {
    &::after {
      background-image: url(~@/assets/icon/check-green.svg);
    }
  }

  &.raised-amount {
    &::after {
      background-image: url("~@/assets/icon/money_white_icon.svg");
    }
  }

  &.country {
    &::after {
      background-image: url("~@/assets/icon/earth_white_icon.svg");
    }
  }
}
</style>

<style lang="scss">
.lead-score {
  $size: 40px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: $size;
  height: $size;
  position: relative;

  &:nth-child(3n + 1) {
    clear: both;
  }

  &.filled {
    $size: 36px;

    background-color: $white;
    border: 2px solid $white;
    box-shadow: 0px 1px 3px $box-shadow;
    border-radius: 50%;
  }

  .pie {
    width: 100%;
    height: 100%;
    clip: rect(0, $size, $size, $size / 2);
    position: absolute;
    left: 0;
    top: 0;
    z-index: 3;

    .half-circle {
      width: 100%;
      height: 100%;
      border: 2px solid #5cc57e;
      border-radius: 50%;
      clip: rect(0, $size / 2, $size, 0);
      left: 0;
      top: 0;
      position: absolute;
    }
  }

  .shadow {
    width: 100%;
    height: 100%;
    border: 2px solid #eee;
    border-radius: 50%;
    z-index: 2;
  }

  .label {
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    background: $white;
    color: #5cc57e;
    border-radius: 50%;
    font-size: 1rem;
    font-family: Lato, sans-serif;
    font-weight: bold;
    width: 100%;
    height: 100%;
    line-height: 1;
  }

  @for $i from 0 to 101 {
    &.progress-#{$i} {
      @if $i <= 50 {
        .pie {
          .half-circle {
            &.right-side {
              display: none;
            }
          }
        }
      } @else {
        .pie {
          clip: rect(auto, auto, auto, auto);

          .half-circle {
            &.right-side {
              transform: rotate(180deg);
            }
          }
        }
      }

      .pie {
        .half-circle {
          &.left-side {
            transform: rotate($i * 3.6deg);
          }
        }
      }
    }
  }
}
</style>

<style lang="scss">
.qualification-score {
  $size: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: $size;
  height: $size;
  position: relative;

  &:nth-child(3n + 1) {
    clear: both;
  }

  &.filled {
    $size: 36px;
    background-color: $white;
    border: 2px solid $white;
    box-shadow: 0px 1px 3px $box-shadow;
    border-radius: 50%;
  }

  .pie {
    width: 100%;
    height: 100%;
    clip: rect(0, $size, $size, $size / 2);
    position: absolute;
    left: 0;
    top: 0;
    z-index: 3;

    .half-circle {
      width: 100%;
      height: 100%;
      border: 2px solid $primary;
      border-radius: 50%;
      clip: rect(0, $size / 2, $size, 0);
      left: 0;
      top: 0;
      position: absolute;
    }
  }

  .shadow {
    width: 100%;
    height: 100%;
    border: 2px solid #eee;
    border-radius: 50%;
    z-index: 2;
  }

  .label {
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    background: $white;
    color: $primary;
    border-radius: 50%;
    font-size: 1rem;
    font-family: Lato, sans-serif;
    font-weight: bold;
    width: 100%;
    height: 100%;
    line-height: 1;
  }

  @for $i from 0 to 101 {
    &.progress-#{$i} {
      @if $i <= 50 {
        .pie {
          .half-circle {
            &.right-side {
              display: none;
            }
          }
        }
      } @else {
        .pie {
          clip: rect(auto, auto, auto, auto);

          .half-circle {
            &.right-side {
              transform: rotate(180deg);
            }
          }
        }
      }

      .pie {
        .half-circle {
          &.left-side {
            transform: rotate($i * 3.6deg);
          }
        }
      }
    }
  }
}
</style>

<style lang="scss">
.checklist-status {
  display: flex;
  flex-flow: column nowrap;
  margin: 1rem;
  font-size: 12px;

  &-progress {
    &-bar {
      display: flex;
      height: 4px;
      background-color: $gray-light;
      &--ok {
        background-color: #55c29c !important;
        height: 4px;
      }
      &--not-ok {
        background-color: #e3544f !important;
        height: 4px;
      }
    }
  }

  &-count {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    &-icon-container {
      width: 10px;
      height: 10px;
    }
  }
}
</style>

<style lang="scss">
.checklist-status-count-icon-container {
  position: relative;
  display: inline-block;
  &:hover {
    cursor: pointer;
  }
}

.tooltip__item {
  visibility: hidden;
  position: absolute;
  left: -60px;
  top: -90px;
  padding: 1rem 1rem 0 2rem !important;
  width: 135px;
  border-radius: 3px;
  background-color: $white;
  box-shadow: 0px 3px 6px $box-shadow;
  z-index: 99;
}

.checklist-status-count-icon-container:hover .tooltip__item {
  visibility: visible;
}
</style>

<style lang="scss">
.mbm-score-field {
  position: relative;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  vertical-align: middle;
  height: 40px;
  width: 40px;

  &.filled {
    background-color: $white;
    border: 2px solid $white;
    border-radius: 50%;
    box-shadow: 0px 1px 3px $box-shadow;
  }

  span {
    position: absolute;
    font-size: 1rem;
    font-family: Lato, sans-serif;
    font-weight: bold;
    line-height: 1;
  }

  img {
    width: 100%;
    height: auto;
  }
}

.webix_menu {
  width: fit-content !important;
  .webix_submenu_icon {
    margin-left: 10px !important;
  }
}

.none {
  display: none;
}
</style>
