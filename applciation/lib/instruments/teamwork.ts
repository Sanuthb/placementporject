import type { Instrument, SituationalItem } from "@/lib/instruments/types";

type O = [string, Record<string, number>];
const sc = (id: string, text: string, opts: O[]): SituationalItem => ({ id, kind: "situational", text, options: opts.map(([t, scores], i) => ({ id: `${id}${"abcd"[i]}`, text: t, scores })) });

/**
 * Teamwork and leadership judgement: ten workplace scenarios. Each option is scored 0-3 on the two skills the scenario tests, so the
 * result is a profile of four skills, not a pass mark. Scenarios and options are original.
 */
export const TEAMWORK: Instrument = {
  key: "teamwork-leadership",
  version: "1.0",
  title: "Teamwork and leadership scenarios",
  description: "What you would do in ten realistic team situations: collaboration, taking the lead, ownership and handling disagreement.",
  category: "TEAMWORK_LEADERSHIP",
  private: false,
  minutes: 12,
  instructions: "Read each situation and choose the ONE action you would most likely take. Pick what you would really do, not what sounds best.",
  caution: "These are judgement questions about workplace behaviour; several answers can be reasonable. The result is a description of your approach, not a pass or fail.",
  scales: [
    { key: "teamwork", label: "Teamwork and collaboration", meaning: { high: "Works with others, shares information and builds on teammates' ideas.", moderate: "Cooperates well in most situations.", low: "Tends to work alone or leave collaboration to others." } },
    { key: "leadership", label: "Leadership and initiative", meaning: { high: "Takes initiative, sets direction and brings others along.", moderate: "Leads when asked or when the need is clear.", low: "Tends to wait for direction from others." } },
    { key: "accountability", label: "Ownership and accountability", meaning: { high: "Owns outcomes, follows through and is honest about problems.", moderate: "Generally follows through on commitments.", low: "May avoid or shift responsibility when things go wrong." } },
    { key: "conflict", label: "Handling disagreement", meaning: { high: "Raises issues respectfully and looks for solutions that work for everyone.", moderate: "Handles most disagreements calmly.", low: "Tends to avoid or escalate disagreements rather than resolve them." } },
  ],
  items: [
    sc("tw-1", "In a group project, one teammate has not done their part and the deadline is in three days.", [
      ["Do their part myself without saying anything so we finish on time.", { teamwork: 1, accountability: 2 }],
      ["Tell the faculty member straight away that the teammate is not working.", { teamwork: 0, accountability: 1 }],
      ["Talk to them privately, find out what is blocking them, offer help and agree a date; tell the team if it still slips.", { teamwork: 3, accountability: 3 }],
      ["Wait and see. It is not my job to chase them.", { teamwork: 0, accountability: 0 }],
    ]),
    sc("tw-2", "Your team is stuck choosing between two approaches and everyone has gone quiet.", [
      ["Suggest we list the pros and cons of both, then decide together by a set time.", { leadership: 3, conflict: 3 }],
      ["Pick the one I prefer and tell everyone we are going with it.", { leadership: 2, conflict: 0 }],
      ["Say nothing; someone else will speak up.", { leadership: 0, conflict: 1 }],
      ["Propose we ask the team lead to decide.", { leadership: 1, conflict: 2 }],
    ]),
    sc("tw-3", "You find a mistake in work you submitted yesterday. It has not been noticed.", [
      ["Say nothing; nobody saw it.", { accountability: 0, teamwork: 0 }],
      ["Quietly fix it and resubmit without mentioning the earlier version.", { accountability: 1, teamwork: 1 }],
      ["Tell the people relying on it right away, explain what changed, and send the corrected version.", { accountability: 3, teamwork: 3 }],
      ["Wait to see whether anyone finds it.", { accountability: 0, teamwork: 0 }],
    ]),
    sc("tw-4", "A teammate publicly criticises your idea in a meeting.", [
      ["Defend the idea strongly and point out the flaws in theirs.", { conflict: 1, teamwork: 1 }],
      ["Stay calm, ask what concerns them, and agree to talk after the meeting if needed.", { conflict: 3, teamwork: 3 }],
      ["Withdraw the idea and stop contributing.", { conflict: 0, teamwork: 0 }],
      ["Complain about them to others afterwards.", { conflict: 0, teamwork: 0 }],
    ]),
    sc("tw-5", "You are asked to lead a small team of friends and classmates for a club event.", [
      ["Share the goal, split the work by what each person is good at, and set a check-in time.", { leadership: 3, teamwork: 3 }],
      ["Do the most important parts myself so they are done properly.", { leadership: 1, teamwork: 0 }],
      ["Let everyone do what they like and see what happens.", { leadership: 0, teamwork: 1 }],
      ["Tell people what to do and expect them to follow.", { leadership: 2, teamwork: 1 }],
    ]),
    sc("tw-6", "Two teammates disagree and it is slowing the work down.", [
      ["Ask each to explain their view, point out what they agree on, and help them choose a way forward.", { leadership: 3, conflict: 3 }],
      ["Stay out of it; they will sort it out.", { leadership: 0, conflict: 1 }],
      ["Take the side of the person I get on with better.", { leadership: 0, conflict: 0 }],
      ["Report the problem to the teacher or manager immediately.", { leadership: 1, conflict: 1 }],
    ]),
    sc("tw-7", "You will miss a deadline you promised because another task took longer than expected.", [
      ["Tell the person who is waiting now, explain why, and give a new realistic date.", { accountability: 3, teamwork: 3 }],
      ["Work through the night and say nothing.", { accountability: 2, teamwork: 1 }],
      ["Submit something unfinished and hope it passes.", { accountability: 0, teamwork: 0 }],
      ["Wait until the deadline passes and then apologise.", { accountability: 1, teamwork: 0 }],
    ]),
    sc("tw-8", "A new member joins your team and seems lost.", [
      ["Show them how the team works and who to ask, and check in after a few days.", { teamwork: 3, leadership: 3 }],
      ["Answer their questions if they ask.", { teamwork: 2, leadership: 1 }],
      ["Leave them to work it out; that is how I learned.", { teamwork: 0, leadership: 0 }],
      ["Tell the team lead that the new member is not keeping up.", { teamwork: 0, leadership: 1 }],
    ]),
    sc("tw-9", "Your idea is not chosen and the team goes with a teammate's plan.", [
      ["Support the plan fully and share any risks I see early.", { teamwork: 3, accountability: 3 }],
      ["Do the minimum so the plan fails and my idea looks better.", { teamwork: 0, accountability: 0 }],
      ["Support it, but remind everyone at every setback that it was not my idea.", { teamwork: 1, accountability: 1 }],
      ["Leave the project.", { teamwork: 0, accountability: 0 }],
    ]),
    sc("tw-10", "Halfway through a project the goal changes and the team is frustrated.", [
      ["Acknowledge the frustration, explain what changed and why, and help the team re-plan the next steps.", { leadership: 3, conflict: 3 }],
      ["Tell them to stop complaining and get on with it.", { leadership: 1, conflict: 0 }],
      ["Agree with the complaints and say it is not fair.", { leadership: 0, conflict: 1 }],
      ["Quietly follow the new goal without discussing it.", { leadership: 1, conflict: 1 }],
    ]),
  ],
};
