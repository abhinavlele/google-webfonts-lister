Google webfonts lister
======================

I needed a list of all available Google webfonts, along with the family name
and variants that can be used to add the font to a webpage. So, here's kemayo's crawler with some changes

Its final output is the inside of a Javascript array, as that's what I needed. Easy
enough to change if you need to.


python webfonts_list_generate.py > js