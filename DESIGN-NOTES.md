# AfroReel Studio: design direction

The two primary jobs are scheduling episodes and analysing performance. The top-level navigation reflects these directly: Scheduling and Analysis. Connections are a utility dialog, not a competing primary section.

## Research applied

- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui): consistent application structure, alignment, and a restrained base/accent/contrast colour system. Applied through shared toolbars, compact navigation, consistent controls, and neutral surfaces.
- [IBM Carbon: Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/): prioritise relevant metrics, use consistent colour assignments, and update related charts together. Applied through a single metric strip, coordinated channel/date filters, and comparison tables.
- [Nielsen Norman Group: Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/): remove content that competes with the user's task. Applied by removing slogans, promotional onboarding cards, redundant summary navigation, and decorative gradients.

These principles improve usability and visual consistency; they are not a test of whether something was made using AI. The assessment that the former design felt generic is a design judgment.

## Interface decisions

Scheduling opens to a weekly publishing plan. Calendar/list views, per-channel filtering, draft editing, and the episode library belong here. Analysis separates social performance from website events, with date ranges and sample totals calculated from the same dataset.

The original supplied AfroReel logo remains intact. Colour accents in controls are restrained; colour in charts and channel markers conveys meaning. Tables use aligned numeric columns and explicit labels. Small screens retain a scrollable weekly grid and offer a list alternative.

## Current limits

This is an interactive preview. All account integrations remain disconnected. Sample episodes are not media assets. User-created drafts are held in React state for the current visit; they are not persisted or published. Analytics are generated sample data and clearly labelled. Backend integration is a separate next step.
