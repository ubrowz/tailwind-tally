# Tailwind Tally

A tool for checking how much of a cycling route is tailwind ("easy") versus
headwind ("hard"), in either riding direction, for a given wind.

This repo currently holds the **tile proxy** backend (`tile-proxy/`), which
keeps the MapTiler API key server-side instead of shipping it in client-side
code. The frontend (a single static HTML page) will move into this repo next.
