# Content sources and selection policy

## Sources

The method catalog draws candidate strategies from six sources:

1. Arthur Benjamin and Michael Shermer, *Secrets of Mental Math*. Left to right arithmetic, multiplication splits, squares, division.
2. Bharati Krishna Tirthaji, *Vedic Mathematics*. Near base methods and vertical crosswise multiplication.
3. Bill Handley, *Speed Mathematics*. Decomposition and practical arithmetic patterns.
4. Scott Flansburg, *Math Magic*. Number relationships and fluency ideas.
5. The Trachtenberg system. Structured multiplication procedures.
6. Traditional arithmetic. Place value, factorization, the distributive law, compensation, estimation.

The initial foundation (fact families and conceptual prerequisites) comes from the project's base load cheatsheet, reorganized into the skill graph.

## Selection policy

Every adopted method rests on a general algebraic identity. Facts and narrow tricks are data, not methods. The policy prefers the simplest broadly useful approach and drops specialized procedures when a general one covers the same ground. Nothing here is copied from a book; all text and examples are original, and all problems are generated.

## Adopted methods and their identities

| Method | Identity it rests on |
| --- | --- |
| Left to right addition | a + b = a + tens(b) + ones(b) |
| Compensation | a + b = (a + c) + (b - c) |
| Grouping | associativity: reorder terms to round pairs |
| Complements | a - b = a - base + (base - b) |
| Distributive split | a * (b + c) = a * b + a * c |
| Near base | (b - x)(b - y) = b(b - x - y) + x y |
| Times 5, 25 | n * 5 = (n * 10)/2, n * 25 = (n * 100)/4 |
| Times 11 | n * 11 = n * 10 + n |
| Doubling and halving | a * b = (2a)(b/2) |
| Factoring | a * b = a * u * v with b = u v |
| Squares | (a + d)^2 = a^2 + 2 a d + d^2 |
| Ending in 5 | (10 t + 5)^2 = 100 t (t + 1) + 25 |
| Division as inverse multiplication | d * q = n |
| Factor and cancel | n / d = n / u / v with d = u v |
| Fraction equivalents | n/d = (100 n)/d percent |
| Percent build | p% of n = (p/100) n, built from anchors |
| Reverse percent | final = n(1 + p) gives n = final/(1 + p) |
| Compound percent | n(1 + p)(1 + q) |
| Ratios | split S in r : s : t means unit S/(r + s + t) |
| Estimation | round operands, keep the error inside a stated tolerance |
| Chains | apply a fixed op list left to right |

## Rejected or de-emphasized

- Trachtenberg digit rules. Many narrow digit procedures; the distributive split covers the same products with one idea and transfers better.
- Vedic vertical crosswise multiplication. Right to left digit work transfers worse than left to right distribution and confuses place order.
- Vedic near base subtraction method is kept because (b - a)(b - c) = b(b - a - c) + a c is a real speedup in the 90 to 110 range, not because of its source.
- Special pair tricks such as "same tens, ones sum to 10". They apply to a thin slice of operands; the general split handles them at similar speed.
- Finger and abacus methods. Out of scope for an arithmetic app.
- Branding and historical claims. No source is evidence of effectiveness; only the algebra is.

## Generation policy

Problems are generated per template from a seeded RNG, never sampled from a fixed bank, so a learner always meets new instances. Every route step displays a value that appears verbatim in its step text, and the last step equals the accepted answer or sits inside its tolerance.
