# Share UI foundation with product-specific themes

Artifact Web and Backoffice will share source-owned React primitives through a
UI Foundation that owns accessible anatomy, interaction behavior, structural
CSS, and component states. Each application will provide its own Product Theme
through a shared Theme Contract, while a small Brand Signature keeps the two
products recognizably related. shadcn may scaffold individual primitives, but
its visual language and a universal cross-product theme are not dependencies;
the first foundation release is limited to commands, basic form controls,
feedback states, Tooltip, and Popover rather than a broad component catalog.
