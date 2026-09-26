# Origem

Skill **UI/UX Pro Max** v2.13.0, de [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
(licença MIT, ver LICENSE). Commit dcc40ff5133ef78276117db0cc34e7b83cc8aeba, de 2026-09-21.
Importada em 26/09/2026. Cerca de 130 mil estrelas no GitHub; é a skill de design da
comunidade mais usada para o Claude Code.

Única mudança em relação ao original: no SKILL.md, `${CLAUDE_PLUGIN_ROOT}` virou
`${CLAUDE_PLUGIN_ROOT:-.}`, para o comando de busca funcionar a partir da raiz deste
projeto (fora do sistema de plugins a variável fica vazia).

Uso rápido (da raiz do projeto):

    python3 .claude/skills/ui-ux-pro-max/scripts/search.py "inventory mobile app" --design-system
    python3 .claude/skills/ui-ux-pro-max/scripts/search.py "bottom sheet touch target" --domain ux
