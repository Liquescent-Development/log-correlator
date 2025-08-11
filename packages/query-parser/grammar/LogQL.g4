grammar LogQL;

// Parser Rules
query
    : streamExpr joinOperator streamExpr (joinOperator streamExpr)* filter? EOF
    ;

streamExpr
    : source '(' selector ')' '[' duration ']'
    ;

source
    : IDENTIFIER
    ;

selector
    : labelSelector
    | graylogSelector
    | promqlSelector
    ;

labelSelector
    : '{' labelMatcherList? '}'
    ;

graylogSelector
    : graylogMatcher (',' graylogMatcher)*
    ;

promqlSelector
    : IDENTIFIER '{' labelMatcherList? '}'
    ;

labelMatcherList
    : labelMatcher (',' labelMatcher)*
    ;

labelMatcher
    : IDENTIFIER op STRING
    | IDENTIFIER op IDENTIFIER
    ;

graylogMatcher
    : IDENTIFIER ':' (STRING | IDENTIFIER)
    ;

op
    : '='
    | '!='
    | '=~'
    | '!~'
    ;

joinOperator
    : joinType 'on' '(' joinKeyList ')' joinModifier*
    ;

joinType
    : 'and'
    | 'or'
    | 'unless'
    ;

joinKeyList
    : joinKey (',' joinKey)*
    ;

joinKey
    : IDENTIFIER
    | IDENTIFIER '=' IDENTIFIER  // Label mapping
    ;

joinModifier
    : 'ignoring' '(' labelList ')'
    | 'within' '(' duration ')'
    | groupModifier
    ;

groupModifier
    : ('group_left' | 'group_right') ('(' labelList? ')')?
    ;

labelList
    : IDENTIFIER (',' IDENTIFIER)*
    ;

filter
    : '{' labelMatcherList '}'
    ;

duration
    : NUMBER timeUnit
    ;

timeUnit
    : 's'
    | 'm'
    | 'h'
    | 'd'
    ;

// Lexer Rules
AND : 'and' ;
OR : 'or' ;
UNLESS : 'unless' ;
ON : 'on' ;
WITHIN : 'within' ;
IGNORING : 'ignoring' ;
GROUP_LEFT : 'group_left' ;
GROUP_RIGHT : 'group_right' ;

IDENTIFIER
    : [a-zA-Z_][a-zA-Z0-9_]*
    ;

STRING
    : '"' (~["\r\n\\] | '\\' .)* '"'
    | '\'' (~['\r\n\\] | '\\' .)* '\''
    ;

NUMBER
    : [0-9]+
    ;

WS
    : [ \t\r\n]+ -> skip
    ;

COMMENT
    : '#' ~[\r\n]* -> skip
    ;