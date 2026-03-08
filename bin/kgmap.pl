use strict;
use warnings;
use utf8;
use Path::Tiny;
use JSON::PS;
use Web::Encoding;

my $Items = [];
our $Keys = {};
our $Data = {items => []};

$Keys->{kana2_feature_tags} = [qw(
  KRTR KNNA MRTN AHIR HTMA TNKS AWAM KIBK
  KTDM ANIT TYKN TYKO HSMI IZMO KIBI TATU AHKS NKTM IRHO NANC UMAS TUSM
  KAMI RUKU HNDE 
)];
$Keys->{kana3_feature_tags} = [qw(
  TAYM MROK
)];
my $ScriptFeatList = $Keys->{script_feature_tags} = [qw(
  HIRA KATA
  OCRF
), @{$Keys->{kana2_feature_tags}}, @{$Keys->{kana3_feature_tags}}]; 
my $ScriptFeatPattern = join '|', @{$Keys->{script_feature_tags}};

{
  $Keys->{with} = {scripts => 1, forms => 1, default_combining_base => 0};
  $Keys->{input_unicode_filter} = sub { 1 };

  my $config_path = path (shift or die)->absolute;
  do $config_path or die "$config_path: $@";

  for my $font_key (keys %{$Data->{fonts}->{sources}}) {
    if ($font_key eq 'gw') {
      my $text = path ('gwlicense.txt')->slurp_utf8;
      $Data->{fonts}->{sources}->{$font_key}->{license_text} = $text;
    }
  }
  for my $font_key (keys %{$Data->{fonts}->{parts}}) {
    my $lt = $Data->{fonts}->{parts}->{$font_key}->{license_type};
    if ($lt eq 'ofl') {
      my $text = path ('OFL.txt')->slurp_utf8;
      $Data->{fonts}->{parts}->{$font_key}->{license_url} = q<http://scripts.sil.org/OFL>;
      $Data->{fonts}->{parts}->{$font_key}->{license_text} = sprintf qq{This Font Software is licensed under the SIL Open Font License, Version 1.1. This Font Software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the SIL Open Font License for the specific language, permissions and limitations governing your use of this Font Software.

This Font Software defines no Reserved Font Name.


"OFL.txt" :

%s}, $text;
    } elsif ($lt eq 'ipa') {
      my $text = path ('IPA_Font_License_Agreement_v1.0.txt')->slurp_utf8;
      $Data->{fonts}->{parts}->{$font_key}->{license_url} = q<https://opensource.org/licenses/IPA/>;
      $Data->{fonts}->{parts}->{$font_key}->{license_text} = sprintf qq{このフォントの使用または利用に当たっては、「IPAフォントライセンスv1.0」に定める条件に従ってください。
このフォントを使用し、複製し、または頒布する行為、その他、「IPAフォントライセンスv1.0」に定める権利の利用を行った場合、受領者は「IPAフォントライセンスv1.0」に
同意したものと見なします。

In using this font, please comply with the terms and conditions set out in "IPA Font License Agreement v1.0".
Any use, reproduction or distribution of the font or any exercise of rights under "IPA Font License Agreement v1.0" by a Recipient constitutes the Recipient's acceptance of the License Agreement.

このフォントは、「IPAフォントライセンスv1.0」第3条 1. (4) が「許諾プログラムが用いている」とする「名称」を有しません。

The font does not have any "name of the Licensed Program" in terms of the "IPA Font License Agreement v1.0" Article 3 1. (4).

「IPAフォントライセンスv1.0」第3条 1. (2) の「派生プログラムをオリジナル・プログラムに置き換える方法を示す指示」は、

  出典 Web サイトにアクセスし、該当するオリジナル・プログラムを入手してください。

The "instructions setting out a method to replace the Derived Program with the Original Program" of the "IPA Font License Agreement v1.0" Article 3 1. (2) is:

  Access to the Source Web Site and get the relevant Original Program.


"IPA_Font_License_Agreement_v1.0.txt" :

%s}, $text;
    } elsif ($lt eq 'arphic') {
      my $text = path ('ARPHIC.txt')->slurp_utf8;
      $Data->{fonts}->{parts}->{$font_key}->{license_url} = q<http://ftp.gnu.org/non-gnu/chinese-fonts-truetype/LICENSE>;
      $Data->{fonts}->{parts}->{$font_key}->{license_text} = sprintf qq{This Font is licensed under the ARPHIC PUBLIC LICENSE.

This Font contains glyphs derived from fonts, listed below, licensed
under the ARPHIC PUBLIC LICENSE, with or without modifications.


"LICENSE" :

%s}, $text;
    } elsif ($lt eq 'ccbysa40') {
      $Data->{fonts}->{parts}->{$font_key}->{license_url} = q<http://creativecommons.org/licenses/by-sa/4.0/>;
      $Data->{fonts}->{parts}->{$font_key}->{license_text} = q{Creative Commons Attribution-ShareAlike 4.0 International <https://creativecommons.org/licenses/by-sa/4.0/>};
    } else {
      die "Bad license type |$lt|";
    }
  }
} # font defs

{
  $Keys->{decomp} = {};
  $Keys->{comp} = {};
  $Keys->{small} = {};
  $Keys->{large} = {};
  for (split //, q(がぎぐげござじずぜぞだぢづでどばびぶべぼガギグゲゴザジズゼゾダヂヅデドバビブベボ)) {
    my $pcode = ord $_;
    my $pcode1 = $pcode-1;
    my $qcode = 0x3099;
    $Keys->{decomp}->{chr $pcode} = (chr $pcode1) . (chr $qcode);
    $Keys->{comp}->{(chr $pcode1) . (chr $qcode)} = chr $pcode;
  }
  for (split //, q(ぱぴぷぺぽパピプペポ)) {
    my $pcode = ord $_;
    my $pcode1 = $pcode-2;
    my $qcode = 0x309A;
    $Keys->{decomp}->{chr $pcode} = (chr $pcode1) . (chr $qcode);
    $Keys->{comp}->{(chr $pcode1) . (chr $qcode)} = chr $pcode;
  }
  for (
    ["ゔ", "う"],
    ["ヴ", "ウ"],
    ["ヷ", "ワ"],
    ["ヸ", "ヰ"],
    ["ヹ", "ヱ"],
    ["ヺ", "ヲ"],
    ["〲", "〱"],
    ["〴", "〳"],
  ) {
    $Keys->{decomp}->{$_->[0]} = $_->[1] . "\x{3099}";
    $Keys->{comp}->{$_->[1] . "\x{3099}"} = $_->[0];
  }
  #for (
  #  
  #) {
  #  $Keys->{decomp}->{$_->[0]} = $_->[1] . "\x{309A}";
  #  $Keys->{comp}->{$_->[1] . "\x{309A}"} = $_->[0];
  #}
  for (
    ["㋐", "ア"], ["㋑", "イ"], ["㋒", "ウ"], ["㋓", "エ"], ["㋔", "オ"],
    ["㋕", "カ"], ["㋖", "キ"], ["㋗", "ク"], ["㋘", "ケ"], ["㋙", "コ"],
    ["㋚", "サ"], ["㋛", "シ"], ["㋜", "ス"], ["㋝", "セ"], ["㋞", "ソ"],
    ["㋟", "タ"], ["㋠", "チ"], ["㋡", "ツ"], ["㋢", "テ"], ["㋣", "ト"],
    ["㋤", "ナ"], ["㋥", "ニ"], ["㋦", "ヌ"], ["㋧", "ネ"], ["㋨", "ノ"],
    ["㋩", "ハ"], ["㋪", "ヒ"], ["㋫", "フ"], ["㋬", "ヘ"], ["㋭", "ホ"],
    ["㋮", "マ"], ["㋯", "ミ"], ["㋰", "ム"], ["㋱", "メ"], ["㋲", "モ"],
    ["㋳", "ヤ"], ["㋴", "ユ"], ["㋵", "ヨ"],
    ["㋶", "ラ"], ["㋷", "リ"], ["㋸", "ル"], ["㋹", "レ"], ["㋺", "ロ"],
    ["㋻", "ワ"], ["㋼", "ヰ"], ["㋽", "ヱ"], ["㋾", "ヲ"],
  ) {
    $Keys->{decomp}->{$_->[0]} = $_->[1] . "\x{20DD}";
    $Keys->{comp}->{$_->[1] . "\x{20DD}"} = $_->[0];
  }
  for (
    ["🈂", "サ"], ["🈓", "テ\x{3099}"], # 🈁
  ) {
    $Keys->{decomp}->{$_->[0]} = $_->[1] . "\x{20DE}";
    $Keys->{comp}->{$_->[1] . "\x{20DE}"} = $_->[0];
  }
  
  for (split //, q(ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ)) {
    my $pcode = ord $_;
    my $pcode1 = $pcode+1;
    $Keys->{large}->{chr $pcode} = chr $pcode1;
    $Keys->{small}->{chr $pcode1} = chr $pcode;
  }
  for (
    ["ゕ", "か"],
    ["ゖ", "け"],
    ["ヵ", "カ"],
    ["ヶ", "ケ"],
    ["ㇰ", "ク"],
    ["ㇱ", "シ"],
    ["ㇲ", "ス"],
    ["ㇳ", "ト"],
    ["ㇴ", "ヌ"],
    ["ㇵ", "ハ"],
    ["ㇶ", "ヒ"],
    ["ㇷ", "フ"],
    ["ㇸ", "ヘ"],
    ["ㇹ", "ホ"],
    ["ㇺ", "ム"],
    ["ㇻ", "ラ"],
    ["ㇼ", "リ"],
    ["ㇽ", "ル"],
    ["ㇾ", "レ"],
    ["ㇿ", "ロ"],
    ["\x{1B132}", "こ"],
    ["\x{1B150}", "ゐ"],
    ["\x{1B151}", "ゑ"],
    ["\x{1B152}", "を"],
    ["\x{1B155}", "コ"],
    ["\x{1B164}", "ヰ"],
    ["\x{1B165}", "ヱ"],
    ["\x{1B166}", "ヲ"],
    ["\x{1B167}", "ン"],
  ) {
    $Keys->{large}->{$_->[0]} = $_->[1];
    $Keys->{small}->{$_->[1]} = $_->[0];
  }
  for (
    ["ｧ", "ァ"], ["ｨ", "ィ"], ["ｩ", "ゥ"], ["ｪ", "ェ"], ["ｫ", "ォ"],
    ["ｬ", "ャ"], ["ｭ", "ュ"], ["ｮ", "ョ"], ["ｯ", "ッ"],
    ["ｱ", "ア"], ["ｲ", "イ"], ["ｳ", "ウ"], ["ｴ", "エ"], ["ｵ", "オ"],
    ["ｶ", "カ"], ["ｷ", "キ"], ["ｸ", "ク"], ["ｹ", "ケ"], ["ｺ", "コ"],
    ["ｻ", "サ"], ["ｼ", "シ"], ["ｽ", "ス"], ["ｾ", "セ"], ["ｿ", "ソ"],
    ["ﾀ", "タ"], ["ﾁ", "チ"], ["ﾂ", "ツ"], ["ﾃ", "テ"], ["ﾄ", "ト"],
    ["ﾅ", "ナ"], ["ﾆ", "ニ"], ["ﾇ", "ヌ"], ["ﾈ", "ネ"], ["ﾉ", "ノ"],
    ["ﾊ", "ハ"], ["ﾋ", "ヒ"], ["ﾌ", "フ"], ["ﾍ", "ヘ"], ["ﾎ", "ホ"],
    ["ﾏ", "マ"], ["ﾐ", "ミ"], ["ﾑ", "ム"], ["ﾒ", "メ"], ["ﾓ", "モ"],
    ["ﾔ", "ヤ"], ["ﾕ", "ユ"], ["ﾖ", "ヨ"],
    ["ﾗ", "ラ"], ["ﾘ", "リ"], ["ﾙ", "ル"], ["ﾚ", "レ"], ["ﾛ", "ロ"],
    ["ﾜ", "ワ"], ["ｦ", "ヲ"], ["ﾝ", "ン"],
    ["ｰ", "ー"],
    ["ﾞ", "゛"], ["ﾟ", "゜"],
  ) {
    $Keys->{fw}->{$_->[0]} = $_->[1];
    $Keys->{hw}->{$_->[1]} = $_->[0];
  }

  $Keys->{has_pwid}->{$_} = 1 for split //, q(
    あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ
    アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ
    ゝゞヽヾ〃〆ーヿゟ〻〼
    ゛゜
  );
  #ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ
  #$Keys->{has_pwid}->{$_} = 1 for keys %{$Keys->{large}};
  $Keys->{has_pwid}->{$_."\x{309A}"} = 1 for qw(か き く け こ カ キ ク ケ コ セ ツ ト);
  #ㇷ
  delete $Keys->{has_pwid}->{"\x09"};
  delete $Keys->{has_pwid}->{"\x0A"};
  delete $Keys->{has_pwid}->{"\x0D"};
  delete $Keys->{has_pwid}->{" "};

  $Keys->{is_hkna}->{$_} = 1 for map { "aj$_" } 12273..12455, 16352..16381;
  $Keys->{is_vkna}->{$_} = 1 for map { "aj$_" } 12456..12638, 16382..16411;
  $Keys->{is_ruby}->{$_} = 1 for map { "aj$_" } 12649..12652, 12671..12868, 16414..16449, 16450..16468;
  $Keys->{is_ruby}->{$_} = 1 for map { "am$_" } 1495..1834, 1934..1983;

  my $rt = {
    0x3099 => 1, 0x309A => 1, 0x0358 => 1,
  };
  my $rb = {
    0x302D => 1,
  };
  my $bottom = {
    0x0323 => 1, 0x0325 => 1,
  };
  my $lb = {
    0x302A => 1, 0x1DFA => 1,
  };
  my $lm = {
  };
  my $lt = {
    0x302B => 1, 0x1DF8 => 1,
  };
  my $ct = {
    0x0301 => 1, 0x0304 => 1, 0x0305 => 1, 0x0308 => 1, 0x0302 => 1,
    0x030A => 1, 0x0307 => 1, 0x0306 => 1, 0x0311 => 1,
    0x0303 => 1,
  };
  my $cm = {
    0x20E5 => 1,
  };
  $Keys->{is_combining}->{$_} = 1 for
      keys %$rt, keys %$rb, keys %$bottom, keys %$lb, keys %$lm, keys %$lt, keys %$ct, keys %$cm;
  $Keys->{mark_class}->{$_} = 'mark_rt' for keys %$rt;
  $Keys->{mark_class}->{$_} = 'mark_rb' for keys %$rb;
  $Keys->{mark_class}->{$_} = 'mark_cb' for keys %$bottom;
  $Keys->{mark_class}->{$_} = 'mark_lb' for keys %$lb;
  $Keys->{mark_class}->{$_} = 'mark_lm' for keys %$lm;
  $Keys->{mark_class}->{$_} = 'mark_lt' for keys %$lt;
  $Keys->{mark_class}->{$_} = 'mark_ct' for keys %$ct;
  $Keys->{combining_chars} = join '', map { chr $_ } sort { $a <=> $b } keys %{$Keys->{is_combining}};

  $Keys->{is_enclosing} = {
    0x20DD => 1, 0x20DE => 1,
  };

  $Keys->{is_sqar_enclosing} = {
    "○" => 1, "●" => 1, "□" => 1, "■" => 1,
    "(" => 1, ")" => 1, "❑" => 1, "▢" => 1,
  };
}

if (defined $Keys->{input_file_names}->{awid}) {
  my $path = path ($Keys->{input_file_names}->{awid});
  for (split /\x0A/, $path->slurp) {
    if (/^0x([0-9A-Fa-f]+):\s+(\d+)\s*$/) {
      my $u = hex $1;
      my $w = 0+$2;
      my $char = $Keys->{decomp}->{chr $u} // chr $u;
      my $large = $Keys->{large}->{$char};
      my $key;
      if (defined $large) {
        $key = sprintf '%d SMAL', ord $large;
      } else {
        $key = join ' ', map { ord $_ } split //, $char;
      }
      $Keys->{aawidth}->{$key} = $w;
    }
  }
}

for (@{$Keys->{gmap_file_names}}) {
  my $path = path ($_);
  my $json = json_bytes2perl $path->slurp;
  die "Failed to read |$path|" unless defined $json;
  push @$Items, @{$json->{groups}};
}
{
  my $new_sis = [];
  for my $subitems (@$Items) {
    for my $subitem (@$subitems) {
      {
        my $si = {};
        for (keys %{$subitem->{uni}->{shg} or {}}) {
          $si->{uni}->{shg}->{$_} = 1;
        }
        for (keys %{$subitem->{uni}->{shgv} or {}}) {
          $si->{uni}->{shgv}->{$_} = 1;
        }
        if (keys %$si) {
          $si->{tags}->{''} = {%{$subitem->{tags}->{''} or {}}};
          $si->{_sans} = 1;
          push @$new_sis, $si;
        }
      }
      {
        my $si = {};
        my $c;
        for (keys %{$subitem->{uni}->{shs} or {}}) {
          $c = chr hex $_;
          $si->{uni}->{shs}->{$_} = 1;
        }
        for (keys %{$subitem->{aj}->{shs} or {}}) {
          $si->{aj}->{shs}->{$_} = 1;
        }
        if (not defined $c) {
          for (keys %{$subitem->{voiced}->{mj} or {}}) {
            $si->{voiced}->{''}->{$_} = 1;
            $c = (chr hex $_) . "\x{3099}";
          }
          for (keys %{$subitem->{voiced}->{ref} or {}}) {
            $si->{voiced}->{ref}->{$_} = 1;
            $c = (chr hex $_) . "\x{3099}";
          }
          for (keys %{$subitem->{semivoiced}->{mj} or {}}) {
            $si->{semivoiced}->{''}->{$_} = 1;
            $c = (chr hex $_) . "\x{309A}";
          }
          for (keys %{$subitem->{semivoiced}->{ref} or {}}) {
            $si->{semivoiced}->{ref}->{$_} = 1;
            $c = (chr hex $_) . "\x{309A}";
          }
        }
        if (keys %$si and defined $c and $Keys->{has_pwid}->{$c}) {
          $si->{tags}->{''} = {%{$subitem->{tags}->{''} or {}}};
          $si->{_pwid} = 1;
          push @$new_sis, $si;
        }
      }
    } # $subitem
  }
  push @$Items, map { [$_] } @$new_sis;
}

my %GWName;

sub set_glyph ($) {
  my $subitem = $_[0];
 
  for (
    ['ucs', 'mj', 'mj', 'cmap'],
    ['ucs', 'mjv', 'mj', 'vert'],
    ['voiced', 'mj', 'mj', 'voiced'],
    ['semivoiced', 'mj', 'mj', 'semivoiced'],
    ['ucs', 'ex', 'ex', 'cmap'],
    ['ucs', 'ipa3', 'ipa3', 'cmap'],
    ['aj', 'shs', 'shs', sub {
       my ($subitem) = @_;
       $subitem->{_glyph} = ['gid', 'shs', 0+[sort { $a <=> $b } map { my $v = $_; $v =~ s/^aj//; $v } keys %{$subitem->{aj}->{shs}}]->[0]];
       $subitem->{_glyph}->[0] = 'gidpwid?' if $subitem->{_pwid};
     }],
    ['uni', 'shs', 'shs', sub {
       my ($subitem) = @_;
       $subitem->{_glyph} = ['cmap', 'shs', hex [sort { $a cmp $b } keys %{$subitem->{uni}->{shs}}]->[0]];
       $subitem->{_glyph}->[0] = 'pwid?' if $subitem->{_pwid};
     }],
    ['uni', 'shsv', 'shs', 'vert'],
    ['aj', 'ext', 'kiri', sub {
       my ($subitem) = @_;
       $subitem->{_glyph} = ['gid', 'kiri', 0+[sort { $a <=> $b } map { my $v = $_; $v =~ s/^aj//; $v } keys %{$subitem->{aj}->{ext}}]->[0]];
     }],
    ['uni', 'shg', 'shg', sub {
       my ($subitem) = @_;
       $subitem->{_glyph} = ['cmap', 'shg', hex [sort { $a cmp $b } keys %{$subitem->{uni}->{shg}}]->[0]];
       $subitem->{_glyph}->[1] = 'shg-bold' if $subitem->{_sans};
     }],
    ['uni', 'shgv', 'shg', sub {
       my ($subitem) = @_;
       $subitem->{_glyph} = ['vert', 'shg', hex [sort { $a cmp $b } keys %{$subitem->{uni}->{shgv}}]->[0]];
       $subitem->{_glyph}->[1] = 'shg-bold' if $subitem->{_sans};
     }],
    ['pua', 'jitaichou', 'jitaichou', 'cmap'],
    ['uni', 'twkana', 'twkana', 'cmap'],
    ['uni', 'notohentai', 'notohentai', 'cmap'],
    ['voiced', 'notohentai', 'notohentai', 'voiced'],
    ['semivoiced', 'notohentai', 'notohentai', 'semivoiced'],
    ['uni', 'GL1', 'gl1', 'cmap'],
    ['uni', 'GL2', 'gl2', 'cmap'],
    ['uni', 'GL3', 'gl3', 'cmap'],
    ['uni', 'GL4', 'gl4', 'cmap'],
    ['uni', 'GL5', 'gl5', 'cmap'],
    ['uni', 'GL1v', 'gl1', 'vert'],
    ['uni', 'GL2v', 'gl2', 'vert'],
    ['uni', 'GL3v', 'gl3', 'vert'],
    ['uni', 'GL4v', 'gl4', 'vert'],
    ['uni', 'GL5v', 'gl5', 'vert'],
    ['voiced', 'GL1', 'gl1', 'voiced'],
    ['voiced', 'GL2', 'gl2', 'voiced'],
    ['voiced', 'GL3', 'gl3', 'voiced'],
    ['voiced', 'GL4', 'gl4', 'voiced'],
    ['voiced', 'GL5', 'gl5', 'voiced'],
    ['uni', 'shokaki', 'shokaki', 'cmap'],
    ['pua', 'dakuten', 'dakuten', 'cmap'],
    ['pua', 'dakutenv', 'dakuten', 'vert'],
    ['jistype', '', 'jistype', sub {
       my ($subitem) = @_;
       $subitem->{_glyph} = ['cmap', 'jistype', ord [sort { $a cmp $b } keys %{$subitem->{jistype}->{''}}]->[0]];
    }],

    ['gw', '', 'gw', sub {
      my ($subitem) = @_;
      $subitem->{_glyph} = ['gwnames', 'gw', [sort { $a cmp $b } keys %{$subitem->{gw}->{''}}]->[0]];
     }],
    
    ['pua', 'kaku', 'kaku', 'cmap'],
    ['uni', 'klee', 'klee', 'cmap'],
    ['uni', 'kleev', 'klee', 'vert'],
    ['uni', 'sung', 'sung', 'cmap'],
    ['uni', 'bsh', 'bsh', 'cmap'],
    ['uni', 'bshv', 'bsh', 'vert'],
    ['pua', 'glnm', 'glnm', 'cmap'],
    ['pua', 'glnmv', 'glnm', 'vert'],
    ['pua', 'nishikiteki', 'nishikiteki', 'cmap'],
    ['pua', 'nishikitekiv', 'nishikiteki', 'vert'],

    ['jis', 'kami', 'kami', sub {
       my ($subitem) = @_;
       my $jis = [sort { $a cmp $b } keys %{$subitem->{jis}->{kami}}]->[0];
       $jis =~ /^1-([0-9]+)-([0-9]+)$/;
       my $c = decode_web_charset "euc-jp", pack 'CC', $1 + 0xA0, $2 + 0xA0;
       $subitem->{_glyph} = ['cmap', 'kami', ord $c];
     }],
    ['pua', 'ahiru-tate', 'ahiru-tate', 'cmap'],
    ['pua', 'katakamna', 'katakamna', 'cmap'],
    ['pua', 'hotukk', 'hotukk', 'cmap'],
    ['pua', 'hotuma101', 'hotuma101', 'cmap'],

    ['g', 'eg', 'eg', sub {
       my ($subitem) = @_;
       $subitem->{_glyph} = ['glyphpaths', 'eg', [sort { $a cmp $b } keys %{$subitem->{g}->{eg}}]->[0]];
     }],
    ['g', 'ep', 'ep', sub {
       my ($subitem) = @_;
       if ($subitem->{tags}->{''}->{tfmarkrt}) {
         $subitem->{_glyph} = ['markrtof', 'ep', [sort { $a cmp $b } keys %{$subitem->{g}->{ep}}]->[0]];
       } else {
         $subitem->{_glyph} = ['glyphpaths', 'ep', [sort { $a cmp $b } keys %{$subitem->{g}->{ep}}]->[0]];
       }
     }],
    ['g', 'ex', 'kiri', sub {
       my ($subitem) = @_;
       my $v = [sort { $a cmp $b } keys %{$subitem->{g}->{ex}}]->[0];
       $subitem->{_glyph} = ['ex', '', $v];
     }],
    ['SMALof', 'mj', 'mj', 'smallof'],
    ['SMALof', 'GL3', 'gl3', 'smallof'],
    ['SMALof', 'gw', 'gw', sub {
       my ($subitem) = @_;
       my $name = [sort { $a cmp $b } keys %{$subitem->{SMALof}->{gw}}]->[0];
       $subitem->{_glyph} = ['smallof', 'gw', $name];
       $GWName{$name} = 1;
     }],
    ['LARGof', 'mj', 'mj', 'largeof'],
    ['LARGof', 'gw', 'gw', sub {
       my ($subitem) = @_;
       my $name = [sort { $a cmp $b } keys %{$subitem->{LARGof}->{gw}}]->[0];
       $subitem->{_glyph} = ['largeof', 'gw', $name];
       $GWName{$name} = 1;
     }],
    ['h4of', 'jitaichou', 'jitaichou', 'height4'],
    ['h3of', 'jitaichou', 'jitaichou', 'height3'],
    ['h2of', 'jitaichou', 'jitaichou', 'height2'],
    ['h4of', 'mjv', 'mj', 'height4v'],
    ['h3of', 'mjv', 'mj', 'height3v'],
    ['h2of', 'mjv', 'mj', 'height2v'],
    ['w4of', 'mj', 'mj', 'width4'],
    ['w3of', 'mj', 'mj', 'width3'],
    ['w2of', 'mj', 'mj', 'width2'],
    ['vrt2of', 'eg', 'eg', sub {
       my ($subitem) = @_;
       my $name = [sort { $a cmp $b } keys %{$subitem->{vrt2of}->{eg}}]->[0];
       $subitem->{_glyph} = ['vrt2of', 'eg', $name];
     }],
    ['vrt2of', 'gw', 'gw', sub {
       my ($subitem) = @_;
       my $name = [sort { $a cmp $b } keys %{$subitem->{vrt2of}->{gw}}]->[0];
       $subitem->{_glyph} = ['vrt2of', 'gw', $name];
       $GWName{$name} = 1;
     }],
    ['bsquaredof', 'mj', 'mj', 'bsquaredof'],
    ['rsquaredof', 'mj', 'mj', 'rsquaredof'],
    ['rbsquaredof', 'mj', 'mj', 'rbsquaredof'],
    ['bsquaredof', 'gw', 'gw', sub {
       my ($subitem) = @_;
       my $name = [sort { $a cmp $b } keys %{$subitem->{'bsquaredof'}->{gw}}]->[0];
       $subitem->{_glyph} = ['bsquaredof', 'gw', $name];
       $GWName{$name} = 1;
     }],
    ['rsquaredof', 'gw', 'gw', sub {
       my ($subitem) = @_;
       my $name = [sort { $a cmp $b } keys %{$subitem->{'rsquaredof'}->{gw}}]->[0];
       $subitem->{_glyph} = ['rsquaredof', 'gw', $name];
       $GWName{$name} = 1;
     }],
    ['rbsquaredof', 'gw', 'gw', sub {
       my ($subitem) = @_;
       my $name = [sort { $a cmp $b } keys %{$subitem->{'rbsquaredof'}->{gw}}]->[0];
       $subitem->{_glyph} = ['rbsquaredof', 'gw', $name];
       $GWName{$name} = 1;
     }],
  ) {
    my ($gmap_cat, $gmap_key, $font_key, $glyph_type) = @$_;
    if (keys %{$subitem->{$gmap_cat}->{$gmap_key} or {}}) {
      my $src = $Data->{fonts}->{sources}->{$font_key};
      if (defined $src) {
        if (ref $glyph_type) {
          $glyph_type->($subitem);
        } else {
          $subitem->{_glyph} = [$glyph_type, $font_key, hex [sort { $a cmp $b } keys %{$subitem->{$gmap_cat}->{$gmap_key}}]->[0]];
        }
        $subitem->{_font} = $src->{part_key};
        return;
      }
    }
  } # for

  {
    my $src = $Data->{fonts}->{sources}->{gw};
    last unless defined $src;
    
    if (keys %{$subitem->{SQAR}->{''} or {}}) {
      my $char = [sort { $a cmp $b } keys %{$subitem->{SQAR}->{''}}]->[0];
      $char =~ s{(.[\x{3099}\x{309A}])}{$Keys->{decomp}->{$1} // $1}ge;
      if (2 == length $char) {
        $subitem->{_glyph} = ['square2', 'gw', [map { sprintf 'u%04x', ord $_ } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (3 == length $char) {
        $subitem->{_glyph} = ['square3', 'gw', [map { sprintf 'u%04x', ord $_ } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (4 == length $char and $char =~ /∵$/) {
        $subitem->{_glyph} = ['square3c', 'gw', [map { sprintf 'u%04x', ord $_ } split //, $char]];
        pop @{$subitem->{_glyph}->[2]};
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (4 == length $char) {
        $subitem->{_glyph} = ['square4', 'gw', [map { sprintf 'u%04x', ord $_ } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (5 == length $char) {
        $subitem->{_glyph} = ['square5', 'gw', [map { sprintf 'u%04x', ord $_ } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (6 == length $char) {
        $subitem->{_glyph} = ['square6', 'gw', [map { sprintf 'u%04x', ord $_ } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (7 == length $char and $char =~ /∴$/) {
        $subitem->{_glyph} = ['square6c', 'gw', [map { sprintf 'u%04x', ord $_ } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } else {
        #
      }
    } elsif (keys %{$subitem->{SQAR}->{'v'} or {}}) {
      my $char = [sort { $a cmp $b } keys %{$subitem->{SQAR}->{'v'}}]->[0];
      $char =~ s{(.[\x{3099}\x{309A}])}{$Keys->{decomp}->{$1} // $1}ge;
      if (2 == length $char) {
        $subitem->{_glyph} = ['square2v', 'gw', [map {
          if ($_ eq 'ー' or defined $Keys->{large}->{$_}) {
            sprintf 'u%04x-vert', ord $_;
          } else {
            sprintf 'u%04x', ord $_;
          }
        } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (3 == length $char) {
        $subitem->{_glyph} = ['square3v', 'gw', [map {
          if ($_ eq 'ー' or defined $Keys->{large}->{$_}) {
            sprintf 'u%04x-vert', ord $_;
          } else {
            sprintf 'u%04x', ord $_;
          }
        } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (4 == length $char and $char =~ /∵$/) {
        $subitem->{_glyph} = ['square3cv', 'gw', [map {
          if ($_ eq 'ー' or defined $Keys->{large}->{$_}) {
            sprintf 'u%04x-vert', ord $_;
          } else {
            sprintf 'u%04x', ord $_;
          }
        } split //, $char]];
        pop @{$subitem->{_glyph}->[2]};
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (4 == length $char) {
        $subitem->{_glyph} = ['square4v', 'gw', [map {
          if ($_ eq 'ー' or defined $Keys->{large}->{$_}) {
            sprintf 'u%04x-vert', ord $_;
          } else {
            sprintf 'u%04x', ord $_;
          }
        } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (5 == length $char) {
        $subitem->{_glyph} = ['square5v', 'gw', [map {
          if ($_ eq 'ー' or defined $Keys->{large}->{$_}) {
            sprintf 'u%04x-vert', ord $_;
          } else {
            sprintf 'u%04x', ord $_;
          }
        } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (6 == length $char) {
        $subitem->{_glyph} = ['square6v', 'gw', [map {
          if ($_ eq 'ー' or defined $Keys->{large}->{$_}) {
            sprintf 'u%04x-vert', ord $_;
          } else {
            sprintf 'u%04x', ord $_;
          }
        } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } elsif (7 == length $char and $char =~ /∴$/) {
        $subitem->{_glyph} = ['square6bv', 'gw', [map {
          if ($_ eq 'ー' or defined $Keys->{large}->{$_}) {
            sprintf 'u%04x-vert', ord $_;
          } else {
            sprintf 'u%04x', ord $_;
          }
        } split //, $char]];
        $GWName{$_} = 1 for @{$subitem->{_glyph}->[2]};
        $subitem->{_font} = $src->{part_key};
        return;
      } else {
        #
      }
    }
  } # gw

  $subitem->{_glyph} = ['cmap', 'base', 0x3013];
  $subitem->{_font} = 1;
} # set_glyph

{
  $Data->{glyphs} = {};
  sub put_glyph ($) {
    my $g = $_[0];
    my $key0 = perl2json_chars $g;
    my $key = $key0;
    my $i = 0;
    while (defined $Data->{glyphs}->{$key}) {
      $key = $key0 . $i++;
    }
    $Data->{glyphs}->{$key} = $g;
    return $key;
  } # put_glyph
  sub delete_glyph ($) {
    my $key = $_[0];
    delete $Data->{glyphs}->{$key};
  } # delete_glyph
  
  $Keys->{subitems} = my $key_to_subitems = {};
  $Keys->{objs} = my $key_to_obj = {};
  my $key_alias = {};
  my $key_to_classes = {};
  my $required_objs = [];
  push @$required_objs, [$_] for 0x0020, 0x25CC, 0x200D, 0x034F, 0x2018, 0x2019;
  my $shown_objs = [];

  for (
    'small_modifier_l', 'small_modifier_r',
    'small_modifier_t', 'small_modifier_b',
    'small_modifier_lt', 'small_modifier_rt',
    'small_modifier_lb', 'small_modifier_rb',
  ) {
    my $gid1 = put_glyph ['dummy', '', ''];
    $Data->{classes}->{small_operators}->{$gid1} = 1;
    $Data->{named_glyphs}->{$_} = $gid1;

    my $gid2 = put_glyph ['dummy', '', ''];
    $Data->{classes}->{small_operators}->{$gid2} = 1;
    $Data->{named_glyphs}->{$_.'_quarter'} = $gid2;

    my $gid3 = put_glyph ['dummy', '', ''];
    $Data->{classes}->{small_operators}->{$gid3} = 1;
    $Data->{named_glyphs}->{$_.'_outside'} = $gid3;

    $Data->{replaces}->{SMLQ}->{$Data->{named_glyphs}->{$_}} 
        = $Data->{named_glyphs}->{$_ . '_quarter'};

    $Data->{replaces}->{SMLO}->{$Data->{named_glyphs}->{$_}} 
        = $Data->{named_glyphs}->{$_ . '_outside'};
  }
  $Data->{replaces}->{vert}->{$Data->{named_glyphs}->{small_modifier_l}} 
      = $Data->{named_glyphs}->{small_modifier_t};
  $Data->{replaces}->{vrt2}->{$Data->{named_glyphs}->{small_modifier_l}} 
      = $Data->{named_glyphs}->{small_modifier_t};
  $Data->{replaces}->{WDLT}->{$Data->{named_glyphs}->{small_modifier_l}} 
      = $Data->{named_glyphs}->{small_modifier_lt};
  $Data->{replaces}->{WDRT}->{$Data->{named_glyphs}->{small_modifier_l}} 
      = $Data->{named_glyphs}->{small_modifier_rt};
  $Data->{replaces}->{rtla}->{$Data->{named_glyphs}->{small_modifier_l}} 
      = $Data->{named_glyphs}->{small_modifier_r};
  $Data->{replaces}->{rtla}->{$Data->{named_glyphs}->{small_modifier_t}} 
      = $Data->{named_glyphs}->{small_modifier_b};
  $Data->{replaces}->{rtla}->{$Data->{named_glyphs}->{small_modifier_lt}} 
      = $Data->{named_glyphs}->{small_modifier_rb};
  $Data->{replaces}->{rtla}->{$Data->{named_glyphs}->{small_modifier_rt}} 
      = $Data->{named_glyphs}->{small_modifier_lb};
  for (
    'SMLB', 'SMCB', 'SMRB', 'SMLM', 'SMCM', 'SMRM', 'SMLT', 'SMCT', 'SMRT',
    'SMPB', 'SMPM', 'SMPT', 'SMLP', 'SMCP', 'SMRP',
  ) {
    my $gid1 = put_glyph ['dummy', '', ''];
    $Data->{classes}->{small_operators}->{$gid1} = 1;
    $Data->{named_glyphs}->{$_} = $gid1;

    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_l}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_r}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_lt}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_rt}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_t}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_b}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_lb}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_rb}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_l_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_r_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_lt_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_rt_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_t_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_b_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_lb_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_rb_quarter}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_l_outside}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_r_outside}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_lt_outside}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_rt_outside}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_t_outside}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_b_outside}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_lb_outside}} =
    $Data->{replaces}->{$_}->{$Data->{named_glyphs}->{small_modifier_rb_outside}} 
        = $Data->{named_glyphs}->{$_};
  }
  for (
    'SMLB_l', 'SMLB_b',
    'SMCB_b',
    'SMRB_r', 'SMRB_b',
    'SMLM_l',
    'SMRM_r',
    'SMLT_l', 'SMLT_t',
    'SMCT_t',
    'SMRT_r', 'SMRT_t',
    'SMPB_b',
    'SMPT_t',
    'SMLP_l',
    'SMRP_r',
  ) {
    my $gid1 = put_glyph ['dummy', '', ''];
    $Data->{classes}->{small_operators}->{$gid1} = 1;
    $Data->{named_glyphs}->{$_} = $gid1;
  }
  for (
    ['l', 'SMLB' => 'SMLB_b'], ['r', 'SMLB' => 'SMLB_b'],
    ['l', 'SMCB' => 'SMCB_b'], ['r', 'SMCB' => 'SMCB_b'],
    ['l', 'SMRB' => 'SMRB_b'], ['r', 'SMRB' => 'SMRB_b'],
    ['l', 'SMPB' => 'SMPB_b'], ['r', 'SMPB' => 'SMPB_b'],
    ['l', 'SMLT' => 'SMLT_t'], ['r', 'SMLT' => 'SMLT_t'],
    ['l', 'SMCT' => 'SMCT_t'], ['r', 'SMCT' => 'SMCT_t'],
    ['l', 'SMRT' => 'SMRT_t'], ['r', 'SMRT' => 'SMRT_t'],
    ['l', 'SMPT' => 'SMPT_t'], ['r', 'SMPT' => 'SMPT_t'],
    ['t', 'SMLB' => 'SMLB_l'], ['b', 'SMLB' => 'SMLB_l'],
    ['t', 'SMLM' => 'SMLM_l'], ['b', 'SMLM' => 'SMLM_l'],
    ['t', 'SMLT' => 'SMLT_l'], ['b', 'SMLT' => 'SMLT_l'],
    ['t', 'SMLP' => 'SMLP_l'], ['b', 'SMLP' => 'SMLP_l'],
    ['t', 'SMRB' => 'SMRB_r'], ['b', 'SMRB' => 'SMRB_r'],
    ['t', 'SMRM' => 'SMRM_r'], ['b', 'SMRM' => 'SMRM_r'],
    ['t', 'SMRT' => 'SMRT_r'], ['b', 'SMRT' => 'SMRT_r'],
    ['t', 'SMRP' => 'SMRP_r'], ['b', 'SMRP' => 'SMRP_r'],
  ) {
    $Data->{replaces}->{$_->[1]}->{$Data->{named_glyphs}->{'small_modifier_'.$_->[0].'_outside'}} 
        = $Data->{named_glyphs}->{$_->[2]};
  }
  for (
    [['SMLB', 'SMCB', 'SMRB'] => 'SMPB'],
    [['SMLB_b', 'SMCB_b', 'SMRB_b'] => 'SMPB_b'],
    [['SMLM', 'SMCM', 'SMRM'] => 'SMPM'],
    [['SMLT', 'SMCT', 'SMRT'] => 'SMPT'],
    [['SMLT_t', 'SMCT_t', 'SMRT_t'] => 'SMPT_t'],
  ) {
    for my $x (@{$_->[0]}) {
      $Data->{replaces}->{pwid}->{$Data->{named_glyphs}->{$x}} = $Data->{named_glyphs}->{$_->[1]};
    }
  }
  for (
    ['small_modifier_l', 'SMCB'], ['small_modifier_l_outside', 'SMCB_b'],
    ['small_modifier_r', 'SMCB'], ['small_modifier_r_outside', 'SMCB_b'],
    ['small_modifier_t', 'SMRM'], ['small_modifier_t_outside', 'SMRM_r'],
    ['small_modifier_b', 'SMRM'], ['small_modifier_b_outside', 'SMRM_r'],
    ['small_modifier_lt', 'SMCM'], ['small_modifier_lt_outside', 'SMCM'],
    ['small_modifier_rt', 'SMCM'], ['small_modifier_rt_outside', 'SMCM'],
    ['small_modifier_lb', 'SMCM'], ['small_modifier_lb_outside', 'SMCM'],
    ['small_modifier_rb', 'SMCM'], ['small_modifier_rb_outside', 'SMCM'],
    ['small_modifier_l_quarter', 'SMLB'],
    ['small_modifier_r_quarter', 'SMRB'],
    ['small_modifier_t_quarter', 'SMRT'],
    ['small_modifier_b_quarter', 'SMRB'],
    ['small_modifier_lt_quarter', 'SMCM'],
    ['small_modifier_lb_quarter', 'SMCM'],
    ['small_modifier_rt_quarter', 'SMCM'],
    ['small_modifier_rb_quarter', 'SMCM'],
  ) {
    push @{$Data->{ccmp}->{smal2} ||= []},
        [[$Data->{named_glyphs}->{$_->[0]}], $Data->{named_glyphs}->{$_->[1]}];
  }
  for (
    'dummy',
  ) {
    my $gid1 = put_glyph ['dummy', '', ''];
    $Data->{classes}->{feature_operators}->{$gid1} = 1;
    $Data->{named_glyphs}->{$_} = $gid1;
  }
  for (
    'SMAL', 'hwid',
  ) {
    my $gid1 = put_glyph ['cmap', 'base', 0x3013];
    $Data->{classes}->{feature_operators}->{$gid1} = 1;
    $Data->{named_glyphs}->{$_} = $gid1;
  }

  my $aj = {};
  my $am = {};
  IT: for my $subitems (@$Items) {
    my $char;
    my $flags = {};
    for my $subitem (@$subitems) {

      for (keys %{$subitem->{aj}->{''} or {}}) {
        if (/^aj([0-9]+)$/) {
          $aj->{$1} = 1;
        }
      }
      for (keys %{$subitem->{am}->{''} or {}}) {
        if (/^am([0-9]+)$/) {
          $am->{$1} = 1;
        }
      }
      
      next if $subitem->{tags}->{''}->{nofont};
      if ($subitem->{tags}->{''}->{p}) {
        $subitem->{tags}->{''}->{nofont} = 1;
        next;
      }
      
      my @v;
      for (keys %{$subitem->{gw}->{''} or {}}) {
        $GWName{$_} = 1;
      }
      for (keys %{$subitem->{uni}->{ref} or {}}) {
        push @v, hex $_;
      }
      for (keys %{$subitem->{uni}->{refv} or {}}) {
        push @v, hex $_;
      }
      for (keys %{$subitem->{uni}->{refsmall} or {}}) {
        push @v, hex $_;
        $flags->{SMAL} = 1;
      }
      for (keys %{$subitem->{uni}->{refsmallv} or {}}) {
        push @v, hex $_;
        $flags->{SMAL} = 1;
      }
      if (not @v) {
        for (values %{$subitem->{ucs} or {}}) {
          push @v, map { hex $_ } keys %$_;
        }
        for (values %{$subitem->{uni} or {}}) {
          push @v, map { hex $_ } keys %$_;
        }
        for (values %{$subitem->{ucsU} or {}}) {
          push @v, map { hex $_ } keys %$_;
        }
        for (values %{$subitem->{jistype} or {}}) {
          push @v, map { ord $_ } keys %$_;
        }
        for my $k2 (@$ScriptFeatList, qw(KMOD)) {
          for my $k1 (keys %{$subitem->{$k2} or {}}) {
            next IT unless $Keys->{with}->{scripts};
            
            $k1 =~ /\A(WHIT|)(SMAL|LARG|SMSM|)([0-9]+)(?:(MK[LCR][TMB])([0-9]+)|)(v|)\z/ or die $k1;
            my $index = 0+$3;
            my $is_whit = $1;
            my $is_smal = $2 eq 'SMAL';
            my $is_larg = $2 eq 'LARG';
            my $is_smsm = $2 eq 'SMSM';
            my $mk = $4;
            my $mk_index = defined $5 ? 0+$5 : undef;
            my $is_vert = $6;
            for (keys %{$subitem->{$k2}->{$k1} or {}}) {
              $char = $_;
              $flags->{$k2} = $index;
              $flags->{vert} = 1 if $is_vert;
              $flags->{SMAL} = 1 if $is_smal;
              $flags->{LARG} = 1 if $is_larg;
              $flags->{SMSM} = 1 if $is_smsm;
              $flags->{WHIT} = 1 if $is_whit;
              $flags->{$mk} = $mk_index if defined $mk;
              @v = ();
              last;
            }
          }
        }
        if ($subitem->{_sans}) {
          $flags->{SANB} = 1;
          next IT unless $Keys->{with}->{scripts};
        }
        $flags->{pwid} = 1 if $subitem->{_pwid};
        for (keys %{$subitem->{text}->{''}}) {
          $char = $_;
          @v = ();
          last;
        }
        for (keys %{$subitem->{text}->{'v'}}) {
          $char = $_;
          $flags->{vert} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{SMAL}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{SMAL} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{LARG}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{LARG} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{SMSM}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{SMSM} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{WHIT}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{WHIT} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{WDLT}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{WDLT} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{WDRT}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{WDRT} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{vrt2}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{vrt2} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{vrt2}->{hwid}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{vrt2} = 1;
          $flags->{hwid} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{SQAR}->{''}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{SQAR} = 1;
          @v = ();
          last;
        }
        for (keys %{$subitem->{SQAR}->{'v'}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $char = $_;
          $flags->{SQAR} = 1;
          $flags->{vert} = 1;
          @v = ();
          last;
        }
      } # not @v
      my $x = [sort { $a <=> $b } @v]->[0];
      if (not defined $x and not defined $char) {
        for (keys %{$subitem->{gw}->{''} or {}}) {
          if (/^(u[0-9a-f]+(?:-u[0-9a-f]+)+)/) {
            $char = join '', map {
              my $s = $_;
              $s =~ s/^u//;
              chr hex $s;
            } split /-/, $1;
            @v = ();
            last;
          } elsif (/u([0-9a-f]+)/) {
            push @v, hex $1;
          }
        }
        $x = [sort { $a <=> $b } @v]->[0];
      }
      $char = chr $x if defined $x;
      for my $script (qw(hira kata)) {
        for my $i (0..9) {
          if ($subitem->{tags}->{''}->{$script.$i}) {
            next IT unless $Keys->{with}->{scripts};
            $flags->{uc $script} = $i;
          }
        }
      }
      {
        my @v;
        for (keys %{$subitem->{voiced}->{ref} or {}},
             keys %{$subitem->{voiced}->{refv} or {}}) {
          push @v, hex $_;
        }
        for (keys %{$subitem->{voiced}->{refsmall} or {}},
             keys %{$subitem->{voiced}->{refsmallv} or {}}) {
          push @v, hex $_;
          $flags->{SMAL} = 1;
        }
        $x = [sort { $a <=> $b } @v]->[0];
        if (defined $x) {
          $char = (chr $x) . "\x{3099}";
        }
      }
      if (not defined $x) {
        my @v;
        for (keys %{$subitem->{voiced}->{notohentai} or {}},
             keys %{$subitem->{voiced}->{mj} or {}},
             keys %{$subitem->{voiced}->{mjv} or {}}) {
          push @v, hex $_;
        }
        $x = [sort { $a <=> $b } @v]->[0];
        if (defined $x) {
          $char = (chr $x) . "\x{3099}";
        }
      }
      {
        my @v;
        for (keys %{$subitem->{semivoiced}->{ref} or {}},
             keys %{$subitem->{semivoiced}->{refv} or {}}) {
          push @v, hex $_;
        }
        for (keys %{$subitem->{semivoiced}->{refsmall} or {}},
             keys %{$subitem->{semivoiced}->{refsmallv} or {}}) {
          push @v, hex $_;
          $flags->{SMAL} = 1;
        }
        $x = [sort { $a <=> $b } @v]->[0];
        if (defined $x) {
          $char = (chr $x) . "\x{309A}";
        }
      }
      if (not defined $x) {
        my @v;
        for (keys %{$subitem->{semivoiced}->{notohentai} or {}},
             keys %{$subitem->{semivoiced}->{mj} or {}},
             keys %{$subitem->{semivoiced}->{mjv} or {}}) {
          push @v, hex $_;
        }
        $x = [sort { $a <=> $b } @v]->[0];
        if (defined $x) {
          $char = (chr $x) . "\x{309A}";
        }
      }
      if (not defined $x) {
        my @v;
        for (keys %{$subitem->{circled}->{ref} or {}}) {
          push @v, hex $_;
        }
        $x = [sort { $a <=> $b } @v]->[0];
        if (defined $x) {
          $char = (chr $x) . "\x{20DD}";
        }
      }
      if (not defined $x) {
        my @v;
        for (keys %{$subitem->{squared}->{ref} or {}}) {
          push @v, hex $_;
        }
        $x = [sort { $a <=> $b } @v]->[0];
        if (defined $x) {
          $char = (chr $x) . "\x{20DE}";
        }
      }
      for my $k2 (qw(MKRT MKRM MKRB MKCB MKLB MKLM MKLT MKCT MKCM)) {
        for my $k1 (keys %{$subitem->{$k2} or {}}) {
          next IT unless $Keys->{with}->{scripts};
          
          $k1 =~ /\A([0-9]+)(v|)\z/ or die $k1;
          my $index = 0+$1;
          my $is_vert = $2;
          for (keys %{$subitem->{$k2}->{$k1} or {}}) {
            $char = $_;
            $flags->{$k2} = $index;
            $flags->{vert} = 1 if $is_vert;
            last;
          }
        }
      }

      if (keys %{$subitem->{ucs}->{mjv} or {}} or
          keys %{$subitem->{ucs}->{exv} or {}} or
          keys %{$subitem->{ucs}->{ipa3v} or {}} or
          keys %{$subitem->{uni}->{shsv} or {}} or
          keys %{$subitem->{uni}->{shgv} or {}} or
          keys %{$subitem->{uni}->{bshv} or {}} or
          keys %{$subitem->{uni}->{kleev} or {}} or
          keys %{$subitem->{uni}->{refv} or {}} or
          keys %{$subitem->{voiced}->{refv} or {}} or
          keys %{$subitem->{semivoiced}->{refv} or {}} or
          keys %{$subitem->{uni}->{refsmallv} or {}} or
          keys %{$subitem->{voiced}->{refsmallv} or {}} or
          keys %{$subitem->{semivoiced}->{refsmallv} or {}} or
          keys %{$subitem->{jis}->{"24v"} or {}} or
          keys %{$subitem->{jis}->{"16v"} or {}} or
          keys %{$subitem->{pua}->{dakutenv} or {}} or
          keys %{$subitem->{pua}->{glnmv} or {}} or
          keys %{$subitem->{pua}->{nishikitekiv} or {}} or
          keys %{$subitem->{SQAR}->{"v"} or {}} or
          (grep { /-vert/ } keys %{$subitem->{gw}->{''} or {}})) {
        $flags->{vert} = 1;
      }
      if (grep { /-small/ } keys %{$subitem->{gw}->{''} or {}}) {
        $flags->{SMAL} = 1;
      }
      if (grep { /-halfwidth/ } keys %{$subitem->{gw}->{''} or {}}) {
        $flags->{hwid} = 1;
      }
      $flags->{hwid} = 1 if $subitem->{tags}->{''}->{hw} or
          $subitem->{tags}->{''}->{hh};
      if ($flags->{hwid}) {
        next IT unless $Keys->{with}->{forms};
      }
    } # $subitem
    if (defined $char) {
      $char = join '', map { $Keys->{decomp}->{$_} // $_ } split //, $char;
      $char = join '', map {
        if (defined $Keys->{fw}->{$_}) {
          $flags->{hwid} = 1;
          $Keys->{fw}->{$_};
        } else {
          $_;
        }
      } split //, $char;
      $char =~ s{^(.)}{
        if (defined $Keys->{large}->{$1}) {
          $flags->{SMAL} = 1;
          $Keys->{large}->{$1};
        } else {
          $1;
        }
      }e;
      $char =~ s/(\x{0305})(\x{0323})/$2$1/;

      next IT unless $Keys->{input_unicode_filter}->(ord $char);
    }
    
    for my $subitem (@$subitems) {
      if ($flags->{SMAL}) {
        if ($flags->{pwid} or $flags->{vert}) {
          $subitem->{tags}->{''}->{nofont} = 1;
        }
      }
      if ($flags->{pwid}) {
        unless ($Keys->{with}->{forms}) {
          $subitem->{tags}->{''}->{nofont} = 1;
        }
      }
      next if $subitem->{tags}->{''}->{nofont};

      set_glyph ($subitem);
      $subitem->{_gid} = put_glyph $subitem->{_glyph};

      #if ({
      #  dakuten => 1,
      #  #glnm => 1,
      #  gl2 => 1,
      #  gl4 => 1,
      #}->{$subitem->{_glyph}->[1]} and
      #    $subitem->{_glyph}->[0] eq 'vert') {
      #  $Data->{classes}->{_smrt}->{$subitem->{_gid}} = 1;
      #}
      
      if (defined $char and $char eq "\x{30FC}") {
        my $d = $flags->{vert} ? 'v' : 'h';
        if ($subitem->{tags}->{''}->{first}) {
          $Data->{named_glyphs}->{"\x{30FC}-$d-first"} = $subitem->{_gid};
        } elsif ($subitem->{tags}->{''}->{middle}) {
          $Data->{named_glyphs}->{"\x{30FC}-$d-middle"} = $subitem->{_gid};
        } elsif ($subitem->{tags}->{''}->{last}) {
          $Data->{named_glyphs}->{"\x{30FC}-$d-last"} = $subitem->{_gid};
        }
      }
    } # $subitem
    
    push @{$Data->{items}}, {subitems => $subitems};

    {
      my $obj = [];
      if (defined $char) {
        my @c = map { ord $_ } split //, $char;
        push @$obj, @c;
        push @$required_objs, [$_] for map { ord $_ } grep {
          if (defined $Keys->{large}->{$_} or defined $Keys->{decomp}->{$_}) {
            ();
          } else {
            $_;
          }
        } split //, $char;
        if (
          $flags->{SQAR} or
          defined $flags->{KMOD} or
          defined $flags->{MKRT} or defined $flags->{MKRM} or
          defined $flags->{MKRB} or defined $flags->{MKCB} or
          defined $flags->{MKLB} or defined $flags->{MKLM} or
          defined $flags->{MKLT} or defined $flags->{MKCT} or
          defined $flags->{MKCM} or do {
            my $m = 0;
            for (@$ScriptFeatList) {
              $m = 1 if defined $flags->{$_};
            }
            $m;
          }
        ) {
          push @$shown_objs, [@$obj];
        } elsif (@c == 1 or
                 (@c > 1 and
                  #not $Keys->{is_combining}->{$c[0]} and
                  #not $Keys->{is_enclosing}->{$c[0]} and
                  not grep {
                    not $Keys->{is_combining}->{$_} and
                    not $Keys->{is_enclosing}->{$_}
                  } @c[1..$#c])) {
          while (@c) {
            push @$required_objs, [@c];
            my $c = pop @c;
            push @$required_objs, [$c];
          }
          push @$required_objs, [@$obj];
        } elsif (($c[-1] == 0x3191 and # re-ten
                  not grep {
                    $Keys->{is_combining}->{$c[-1]} or
                    $Keys->{is_enclosing}->{$c[-1]}
                  } @c[0..$#c-1]) or
                 (@c == 3 and
                  ($c[1] == 0x200D or $c[1] == 0x034F) and
                  not ($Keys->{is_combining}->{$c[0]} or
                       $Keys->{is_enclosing}->{$c[0]}) and
                  not ($Keys->{is_combining}->{$c[2]} or
                       $Keys->{is_enclosing}->{$c[2]}))) {
          for (@c) {
            push @$required_objs, [$_];
          }
          push @$shown_objs, [@$obj];
        } else {
          die "Bad |@$obj|";
        }
      } else {
        push @$obj, 0x3013;
        push @$required_objs, [0x3013];
      }
      for my $feat (@$ScriptFeatList) {
        if (defined $flags->{$feat}) {
          for (0..($flags->{$feat} - 1)) {
            push @$required_objs, [@$obj, $feat . $_];
          }
          push @$obj, $feat . $flags->{$feat};
        }
      }
      if (defined $flags->{KMOD}) {
        for (0..($flags->{KMOD} - 1)) {
          push @$required_objs, [@$obj, 'KMOD' . $_];
        }
        push @$obj, 'KMOD' . $flags->{KMOD};
      }
      for my $k2 (qw(MKRT MKRM MKRB MKCB MKLB MKLM MKLT MKCT MKCM)) {
        if (defined $flags->{$k2}) {
          for (0..($flags->{$k2} - 1)) {
            push @$shown_objs, [@$obj, $k2 . $_];
            if (@$obj > 0 and $obj->[-1] =~ /^[0-9]+$/) {
              push @$required_objs, [$obj->[-1], $k2 . $_];
            } elsif (@$obj > 1 and $obj->[-1] =~ /[^0-9]/ and
                     $obj->[-2] =~ /^[0-9]+$/) {
              push @$required_objs, [$obj->[-2], $k2 . $_];
            }
          }
          if (@$obj == 1) {
            push @$shown_objs, [@$obj, $k2 . $flags->{$k2}];
            push @$shown_objs, [0x0020, @$obj, $k2 . $flags->{$k2}];
            push @$shown_objs, [0x00A0, @$obj, $k2 . $flags->{$k2}];
            push @$shown_objs, [0x3000, @$obj, $k2 . $flags->{$k2}];
            push @$shown_objs, [0x25CC, @$obj, $k2 . $flags->{$k2}];
          }
          push @$obj, $k2 . $flags->{$k2};
        }
      } # $k2
      if ($flags->{SMAL}) {
        push @$required_objs, [@$obj];
        push @$obj, 'SMAL';
        #push @$required_objs, [@$obj, 'vert'];
        if (@$obj >= 2 and {
          0x3099 => 1, 0x309A => 1,
        }->{$obj->[-2]}) {
          # (base) (voiced) SMAL
          # (base) SMAL (voiced)
          my $obj2 = [@$obj];
          ($obj2->[-1], $obj2->[-2]) = ($obj2->[-2], $obj2->[-1]);
          my $key2 = join ' ', @$obj2;
         #XXX $key_alias->{$key2} = join ' ', @$obj;
          $key_to_obj->{$key2} = [@$obj2];
          pop @$obj2;
          push @$required_objs, $obj2;
        }
      }
      for my $f (qw(LARG SMSM WHIT SANB)) {
        if ($flags->{$f}) {
          push @$required_objs, [@$obj];
          push @$obj, $f;
        }
      }
      if ($flags->{SQAR}) {
        push @$obj, 'SQAR';
        push @$shown_objs, [@$obj, 'vert'];
      }
      if ($flags->{hwid}) {
        push @$required_objs, [@$obj];
        push @$obj, 'hwid';
        if (@$obj >= 3 and $obj->[-2] eq 'SMAL') {
          my $obj2 = [@$obj];
          ($obj2->[-1], $obj2->[-2]) = ($obj2->[-2], $obj2->[-1]);
          my $key2 = join ' ', @$obj2;
         #XXX $key_alias->{$key2} = join ' ', @$obj;
          $key_to_obj->{$key2} = [@$obj2];
          pop @$obj2;
          push @$required_objs, $obj2;
        }
      }
      if ($flags->{SMAL} and ($flags->{pwid} or $flags->{vert})) {
        #
      } else {
        for my $f (qw(vert)) {
          if ($flags->{$f}) {
            push @$required_objs, [@$obj];
            push @$obj, $f;
          }
        }
        if ($Keys->{with}->{forms}) {
          for my $f (qw(pwid vrt2 WDRT WDLT)) {
            if ($flags->{$f}) {
              push @$required_objs, [@$obj];
              push @$obj, $f;
            }
          }
        }
      }

      my $key = join ' ', @$obj;
      if ($key eq 0x3013) {
      #  warn "Bad item: ", perl2json_bytes $subitems
      #      if grep { not $_->{tags}->{''}->{nofont} } @$subitems;
      } else {
        $key_to_obj->{$key} = $obj;
      }
      for my $subitem (@$subitems) {
        next if $subitem->{tags}->{''}->{nofont};
        push @{$key_to_subitems->{$key} ||= []}, $subitem;
      }

      if (not $obj->[0] =~ /\A[0-9]+\z/) {
        #
      } elsif (grep { $_ =~ /^MKLM/ } @$obj) {
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};

          $Data->{classes}->{mark_lm}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['mark_lm'];
      } elsif (my $m = $Keys->{mark_class}->{$obj->[0]}) {
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};

          $Data->{classes}->{$m}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = [$m];
      } elsif ($obj->[0] < 0x0080 or $obj->[0] == 0x3013 or
               (0x3300 <= $obj->[0] and $obj->[0] <= 0x3357) or
               (0x1AFF0 <= $obj->[0] and $obj->[0] <= 0x1AFFF) or
               (0x1F200 <= $obj->[0] and $obj->[0] <= 0x1F2FF)) {
        #
      } elsif ({
        0x309B => 1, 0x309C => 1,
      }->{$obj->[0]}) {
        #
      } elsif (grep { $Keys->{is_enclosing}->{$_} or $_ eq 'SQAR' } @$obj) {
        #
      } elsif (grep { $_ eq 'hwid' } @$obj) {
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};

          $Data->{classes}->{halfwidth}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['halfwidth'];
      } elsif (grep { ($Keys->{mark_class}->{$_} // '') eq 'mark_rt' } @$obj) {
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};
          $Data->{classes}->{with_rt}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['with_rt'];
      } elsif (grep { $_ eq 'SMAL' } @$obj) {
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};
          $Data->{classes}->{small}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['small'];
      } elsif (grep { $_->{tags}->{''}->{modr} } @$subitems) {
        ## Modifiers at the right of the base
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};
          $Data->{classes}->{modr}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['modl'];
      } elsif (grep { $_->{tags}->{''}->{modl} } @$subitems) {
        ## Modifiers at the left of the base
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};
          $Data->{classes}->{modl}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['modl'];
      } elsif (grep { $_->{tags}->{''}->{modtw} } @$subitems) {
        ## Taiwanese modifiers
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};
          $Data->{classes}->{modtw}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['modtw'];
      } elsif (grep { $_->{tags}->{''}->{tsu} } @$subitems) {
        ## Small kana TSU
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};
          $Data->{classes}->{normal}->{$subitem->{_gid}} = 1;
          $Data->{classes}->{tsu}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['normal', 'tsu'];
      } else {
        for my $subitem (@$subitems) {
          next if $subitem->{tags}->{''}->{nofont};
          $Data->{classes}->{normal}->{$subitem->{_gid}} = 1;
        }
        $key_to_classes->{$key} = ['normal'];
      }
      if (not $obj->[0] =~ /^[0-9]+$/) {
        #
      } elsif ((0x3041 <= $obj->[0] and $obj->[0] <= 0x3096) or
               (0x390D <= $obj->[0] and $obj->[0] <= 0x309E) or
               (0x30A1 <= $obj->[0] and $obj->[0] <= 0x30F6) or
               (0x30FC <= $obj->[0] and $obj->[0] <= 0x30FE) or
               (0x31F0 <= $obj->[0] and $obj->[0] <= 0x31FF) or
               (0x1B000 <= $obj->[0] and $obj->[0] <= 0x1B167)) {
      #  push @{$key_to_classes->{$key} ||= []}, 'kana1';
        ## Kana letter counted as 1 unit
      }
    }
  } # IT: $data
  for my $obj (@$required_objs) {
    my $key = join ' ', @$obj;
    next if defined $key_to_obj->{$key};
    
    $key_to_obj->{$key} = $obj;
    my $subitem = {
      _glyph => ['cmap', 'base', 0x3013],
      _font => 1,
    };
    if (@$obj == 1 and $obj->[0] =~ /\A[0-9]+\z/) {
      if ($Keys->{is_combining}->{$obj->[0]} and
          not $Keys->{with}->{default_combining_base}) {
        $subitem->{_font} = 1;
        $subitem->{_glyph} = ['cmap', 'base', 0x3013];
        warn "No glyph for |$key|";
      } elsif ({
        0x0020 => 1,
      }->{$obj->[0]}) {
        $subitem->{_font} = 1;
        $subitem->{_glyph} = ['cmap', 'base', 0x3000];
      } else {
        #or $Keys->{is_enclosing}->{$obj->[0]}
        my $name = sprintf 'u%04x', $obj->[0];
        $subitem->{_font} = 1;
        $subitem->{_glyph} = ['gwnames', 'gw', $name];
        $GWName{$name} = 1;
      }
    } elsif (@$obj == 2 and $obj->[1] =~ /\AMK[LCR][TMB][0-9]+\z/ and
             $obj->[0] =~ /\A[0-9]+\z/) {
      $subitem->{_font} = 1;
      $subitem->{_glyph} = ['cmap', 'base', 0x3013];
    } else {
      warn "No glyph for |$key|"
          unless $key =~ /^[0-9]+ (?:12441 (?:8421 |)|)[A-Z]+[0-9]+$/;
    }
    $subitem->{_gid} = put_glyph $subitem->{_glyph};
    push @{$key_to_subitems->{$key} ||= []}, $subitem;

    if (my $m = {
      0x0020 => 'basespace', 0x25CC => 'normal',
    }->{$key}) {
      $Data->{classes}->{$m}->{$subitem->{_gid}} = 1;
      $key_to_classes->{$key} = [$m];
    }
  } # $obj

  sub all_patterns ($) {
    my $list = $_[0];
    my $n = @$list;
    my @result;
    for my $mask (1 .. (1 << $n) - 1) {
      my $item = [];
      for my $i (0 .. $n - 1) {
        if ($mask & (1 << $i)) {
          push @$item, $list->[$i];
        }
      }
      push @result, $item;
    }
    return \@result;
  } # all_patterns

  my $key_to_gid = {};
  my $gid_to_lig = {};
  my $tags = $Keys->{tags}->{index_to_key} = [qw(
    s1 s2 s3 s4 s5 s6
    u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20 u21 u22
    n0 n1 n2 n3 n4 n5 n6
    r0 r1 r2 r3 r4 r5 r6 r7 r8 r9 r10 r11 r12 r13 r14 r15
    x0 x1 x2 x3 x4 x5 x6 x7
    h0 h1 h2 h3
    c0 c1 c2 c3 c4
    l0 l1 l2
    o0 o1 o2 o3
    d0 d1 d2 d3 d4  )];
  $Keys->{tags}->{max_salt} = -1;
  $Data->{variant_tags} = $Keys->{tags}->{index_to_tag} = my $tag_map = [qw(
    cv01 cv02 cv03 cv04 cv05 cv06
    ss20 ss21 ss22 ss23 ss24 ss25 ss26 ss27 ss28 ss29 ss30 ss31 ss32 ss33 ss34 ss35 ss36 ss37 ss38 ss39 ss40 ss41 ss42
    cv10 cv11 cv12 cv13 cv14 cv15 cv16
    cv60 cv61 cv62 cv63 cv64 cv65 cv66 cv67 cv68 cv69 cv70 cv71 cv72 cv73 cv74 cv75
    cv50 cv51 cv52 cv53 cv54 cv55 cv56 cv57
    ss01 ss02 ss03 ss04
    ss05 ss06 ss07 ss08 ss09
    cv39 cv40 cv41
    ss10 ss11 ss12 ss13
    cv42 cv43 cv44 cv45 cv46  )];
  die unless @$tag_map == @$tags;
  $Data->{$_} ||= {} for @$tag_map;
  for (0..$#$tag_map) {
    $Keys->{tag_labels_html}->{$tag_map->[$_]} //= '<code>'.$tags->[$_].'</code>';
    if ($tags->[$_] =~ /^r/) {
      $Keys->{tag_labels_html}->{$tag_map->[$_]} .= sprintf ' <p- font=1 HIRA=0 tags="%s">%s</p->',
          $tag_map->[$_], "丨";
    }
    if ($tags->[$_] =~ /^x/) {
      $Keys->{tag_labels_html}->{$tag_map->[$_]} .= sprintf ' <p- font=1 HIRA=0 tags="%s">%s</p->',
          $tag_map->[$_], "+";
    }
    if ($tags->[$_] =~ /^u/) {
      for my $x (
        [fu => 'ふ'],
        [me => "め"],
        [wa => "わ"],
      ) {
        $Keys->{tag_labels_html}->{$tag_map->[$_], $x->[0]} //= '<code>'.$tags->[$_].'</code>';
        $Keys->{tag_labels_html}->{$tag_map->[$_], $x->[0]} .= sprintf ' <p- font=1 tags="%s">%s</p->',
            $tag_map->[$_], $x->[1];
      }
    }
    $Keys->{label_to_tag}->{$tags->[$_]} //= $tag_map->[$_];
  }
  my $pat = '%03d';
  my $tag_to_index = {};
  $tag_to_index->{$tags->[$_]} = $_ for 0..$#$tags;
  $Keys->{tags}->{sets} = my $tag_sets = {};
  my $GlyphTypeLevel = {
    mj => 42,
    shs => 32,
    kiri => 31,
    dakuten => 30,
    gw => 21,
    eg => 20,
    shg => 15,
    glnm => 10,
    
    #shs => 111,
    #shg => 110,
    #mj => 32,
    #gw => 31,
    #eg => 30,
  };
  for my $key (sort { $a cmp $b } keys %$key_to_obj) {
    next if defined $key_alias->{$key};

    my $subitems = $key_to_subitems->{$key};

    my $partial = {};
    my $exact = {};
    my $si_to_tag_key_l = {};
    my $has_ocr0 = 0;
    my $has_ocr1 = 0;
    my $ocr_si;
    for my $subitem (@$subitems) {
      next if $subitem->{tags}->{''}->{nofont};
      
      my @tag_index = sort { $a <=> $b } grep { defined $_ } map { $tag_to_index->{$_} } keys %{$subitem->{tags}->{''} or {}};
      @tag_index = () unless $Keys->{with}->{forms};
      my $tag_key = join ' ', map { sprintf $pat, $_ } @tag_index;
      push @{$exact->{$tag_key} ||= []}, $subitem;
      if (@tag_index) {
        for (@{all_patterns (\@tag_index)}) {
          push @{$partial->{join ' ', map { sprintf $pat, $_ } @$_} ||= []}, $subitem;
        }
        push @{$partial->{''} ||= []}, $subitem;
      } else {
        push @{$partial->{$tag_key} ||= []}, $subitem;
      }
      $si_to_tag_key_l->{$subitem} = length $tag_key;
    } # $subitem

    my $t_debug = 0;

    my $k_to_gid = {};
    for my $k (sort { $a cmp $b } keys %$partial) {
      my @k = split / /, $k;

      my $subitems = $exact->{$k};
      if (@{$exact->{$k} or []}) {
        $Keys->{tags}->{tagged}->{$key}->{$k} = $exact->{$k};
      } else {
        $subitems = $partial->{$k};
      }
      $subitems = [sort {
        #$si_to_tag_key_l->{$a} <=> $si_to_tag_key_l->{$b} ||
        ($GlyphTypeLevel->{$b->{_glyph}->[1]} || 0) <=> ($GlyphTypeLevel->{$a->{_glyph}->[1]} || 0)
      } @$subitems];
      $Keys->{tags}->{any}->{$key}->{$k} = 1;
      my $si = $subitems->[0];
      $Keys->{key_to_default_subitem}->{$key} = $si if $k eq '';
      my $g2 = $si->{_gid};
      
      my $g1;
      if (@k > 0) {
        my @l = @k;
        pop @l;
        my $l = join ' ', @l;
        $g1 = $k_to_gid->{$l} // die "Bad |$key| |$k| ($l)";
      }

      # XXX
      my $partial_diffs = {};
      $partial_diffs->{$_} = 1 for @{$partial->{$k}};
      my $new_gids = [];
      if ((1 < keys %$partial_diffs or
           (@{$partial->{$k}} > @{$exact->{$k} or []} and
            @{$exact->{$k} or []} > 1)) and
          $Keys->{with}->{forms}) {
        $g2 = put_glyph $si->{_glyph};
        push @$new_gids, $g2;
        $Data->{classes}->{$_}->{$g2} = 1 for @{$key_to_classes->{$key} or []};
      }
      warn "<$k> partial: @{[0+@{$partial->{$k}}]}, exact: @{[0+@{$exact->{$k} or []}]}\n" if $t_debug;
      $tag_sets->{$k} = 1;
      warn "{$g2} @{$si->{_glyph}}\n" if $t_debug;
      if (@k > 0) {
        my $tag = $tag_map->[$k[-1]];
        $Data->{$tag}->{$g1} = $g2;
        warn "  $g1 -$k[-1] ($tag)-> $g2\n" if $t_debug;
      } else { # $k eq ''
        $key_to_gid->{$key} = $g2;
        warn "[$key] $g2\n" if $t_debug;

        for my $si (@$subitems) {
          last unless $Keys->{with}->{forms};
          
          for my $aj (keys %{$si->{aj}->{''} or {}}) {
            if ($Keys->{is_hkna}->{$aj}) {
              $Data->{hkna}->{$g2} = $si->{_gid}
                  if $g2 ne $si->{_gid};
              push @$shown_objs, [@{$key_to_obj->{$key}}, 'hkna'];
            } elsif ($Keys->{is_vkna}->{$aj}) {
              $Data->{vkna}->{$g2} = $si->{_gid}
                  if $g2 ne $si->{_gid};
              push @$shown_objs, [@{$key_to_obj->{$key}}, 'vkna'];
            } elsif ($Keys->{is_ruby}->{$aj}) {
              $Data->{ruby}->{$g2} = $si->{_gid}
                  if $g2 ne $si->{_gid};
              push @$shown_objs, [@{$key_to_obj->{$key}}, 'ruby'];
            }
          } # $aj
          if (keys %{$si->{ocrhh}->{''} or {}}) {
            $Data->{OCRF}->{$g2}->[0] = $si->{_gid};
            push @$shown_objs, [@{$key_to_obj->{$key}}, 'OCRF0'];
            $has_ocr0 = 1;
          }
          if (keys %{$si->{jisx0201}->{ocrk} or {}}) {
            $Data->{OCRF}->{$g2}->[0] = $si->{_gid};
            push @$shown_objs, [@{$key_to_obj->{$key}}, 'OCRF0'];
            $has_ocr0 = 1;
          }
          if (keys %{$si->{jisx0201}->{ocrhk} or {}}) {
            $Data->{OCRF}->{$g2}->[1] = $si->{_gid};
            push @$shown_objs, [@{$key_to_obj->{$key}}, 'OCRF1'];
            $has_ocr1 = 1;
          }
          if (keys %{$si->{jisx0201}->{''} or {}}) {
            $ocr_si = $si;
          }
        } # $si
      }
      $k_to_gid->{$k} = $g2;
      $Keys->{font}->{$key}->{$k} = $subitems->[0]->{_font};

      for my $si (@$subitems) {
        if ($si->{tags}->{''}->{smcm}) {
          push @{$Data->{ccmp}->{last} ||= []}, [[
            $g2, $Data->{named_glyphs}->{SMCM},
          ] => $si->{_gid}];
        } elsif ($si->{tags}->{''}->{smcb}) {
          push @{$Data->{ccmp}->{last} ||= []}, [[
            $g2, $Data->{named_glyphs}->{SMCB},
          ] => $si->{_gid}];
        } elsif ($si->{tags}->{''}->{smrt}) {
          push @{$Data->{ccmp}->{last} ||= []}, [[
            $g2, $Data->{named_glyphs}->{SMRT},
          ] => $si->{_gid}];
        } elsif ($si->{tags}->{''}->{smrm}) {
          push @{$Data->{ccmp}->{last} ||= []}, [[
            $g2, $Data->{named_glyphs}->{SMRM},
          ] => $si->{_gid}];
        } elsif ($si->{tags}->{''}->{smrb}) {
          push @{$Data->{ccmp}->{last} ||= []}, [[
            $g2, $Data->{named_glyphs}->{SMRB},
          ] => $si->{_gid}];
        } else {
          $si->{_salt} = 1;
        }
      } # $si
      
      $Keys->{tags}->{max_salt} = @$subitems
          if @$subitems > $Keys->{tags}->{max_salt};
      if (@{$exact->{$k} or []}) {
        $Data->{salt}->{$g2} = [map { $_->{_gid} } grep { $_->{_salt} } @$subitems];
        push @$new_gids, map { $_->{_gid} } @$subitems;
      }

      my $width = $Keys->{aawidth}->{$key};
      if (defined $width) {
        for (@$new_gids) {
          $Data->{AWID}->{$_} = $width;
        }
        push @$shown_objs, [@{$key_to_obj->{$key}}, 'AWID'];
      }

      if (grep { $_ eq 'SMAL' } @{$key_to_obj->{$key}}) {
        if (grep { $_ eq 'vrt2' } @{$key_to_obj->{$key}}) {
          #
        } elsif (grep { $_ eq 'hwid' } @{$key_to_obj->{$key}}) {
          #
        } elsif (grep { $_ eq 'vert' } @{$key_to_obj->{$key}}) {
          #
        } else {
          for (@$new_gids) {
            $Data->{classes}->{small_normal}->{$_} = 1;
          }
        }
      }
    } # $k
    if (defined $ocr_si) {
      if (not $has_ocr0) {
        $Data->{OCRF}->{$k_to_gid->{''}}->[0] = $ocr_si->{_gid};
        push @$shown_objs, [@{$key_to_obj->{$key}}, 'OCRF0'];
      }
      if (not $has_ocr1) {
        $Data->{OCRF}->{$k_to_gid->{''}}->[1] = $ocr_si->{_gid};
        push @$shown_objs, [@{$key_to_obj->{$key}}, 'OCRF1'];
      }
    }

    unless ($Keys->{with}->{forms}) {
      for my $si (@$subitems) {
        unless ($si eq $Keys->{key_to_default_subitem}->{$key}) {
          delete_glyph delete $si->{_gid};
        }
      }
    }
  } # $key
  
  for my $key (sort { $a cmp $b } keys %$key_to_obj) {
    my $obj = $key_to_obj->{$key};
    if (@$obj == 1) {
      if ($obj->[0] =~ /\A[0-9]+\z/) {
        $Data->{cmap}->{$obj->[0]} = $key_to_gid->{$key};
      } else {
        # XXX
      }
    }
  } # $key
  for my $key (sort {
    @{$key_to_obj->{$a}} <=> @{$key_to_obj->{$b}} ||
    $a cmp $b;
  } keys %$key_to_obj) {
    my $obj = $key_to_obj->{$key};
    if (@$obj == 1) {
      #
    } else {
      if ($obj->[-1] =~ /\A[0-9]+\z/) {
        if (grep { not /\A[0-9]+\z/ } @$obj) { # e.g. {base} SMAL {voiced}
          my $so = [@$obj];
          pop @$so;
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk}};
          die "Bad |$sk|" unless defined $sg;

          my $g = $key_to_gid->{$obj->[-1]};

          my $gid = $key_to_gid->{$key};
          $gid //= $key_to_gid->{"$obj->[0] $obj->[2] $obj->[1]"}
              if @$obj == 3;
          die "Bad |$key|" unless defined $gid;

          push @{$Data->{ccmp}->{fin} ||= []}, [[$sg, $g] => $gid];
        } elsif (not grep {
          not ($Keys->{is_combining}->{$_} or $Keys->{is_enclosing}->{$_});
        } @$obj) { # combining only
          my @gid = map {
            my $ss = $key_to_gid->{$_};
            die "Broken: |$key| (@$obj)" unless defined $ss;
            $ss;
          } @$obj;
          
          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          my $ccmp_type = 'cmb2';
          $ccmp_type = 'cmb3' if @$obj >= 3;
          $ccmp_type = 'cmb4' if @$obj >= 4;
          push @{$Data->{ccmp}->{$ccmp_type} ||= []}, [\@gid => $gid];
        #} elsif (not $Keys->{is_combining}->{$obj->[0]} and
        #         not $Keys->{is_enclosing}->{$obj->[0]} and
        #         not grep {
        #  not ($Keys->{is_combining}->{$_} or $Keys->{is_enclosing}->{$_});
        #} @$obj[1..$#$obj]) { # base combining+
        } else { # re-ten, zwj
          my @gid = map {
            my $ss = $key_to_gid->{$_};
            die "Broken: |$key| (@$obj)" unless defined $ss;
            $ss;
          } @$obj;
          
          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }
          die unless defined $gid;

          push @{$Data->{ccmp}->{main} ||= []}, [\@gid => $gid];
        }
      } elsif ($obj->[-1] eq 'SMAL') {
        if (@$obj == 2 and $obj->[0] =~ /^[0-9]+$/ and
            not ($Keys->{is_combining}->{$obj->[0]} or
                 $Keys->{is_enclosing}->{$obj->[0]})) {
          my $so = [@$obj];
          pop @$so;
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk}};
          die "Bad |$sk|" unless defined $sg;
          
          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$obj == 3 and $obj->[0] =~ /^[0-9]+$/ and
                 not ($Keys->{is_combining}->{$obj->[0]} or
                      $Keys->{is_enclosing}->{$obj->[0]}) and
                 $Keys->{is_combining}->{$obj->[1]}) {
          # [base] [combining] SMAL
          my $so = [@$obj];
          pop @$so;
          
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }
          die unless defined $gid2;

          {
            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $obj->[-1]}
                // die "Bad |$so->[0] $obj->[-1]| (@$obj)";
            push @gid1, $key_to_gid->{$so->[1]}
                // die "Bad |$so->[1]| (@$obj)";
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
          }
          if (defined $key_to_gid->{$so->[1] . ' vert'}) {
            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $obj->[-1]}
                // die "Bad |$so->[0] $obj->[-1]| (@$obj)";
            push @gid1, $key_to_gid->{$so->[1] . ' vert'}
                // die "Bad |$so->[1] vert| (@$obj)";
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
          }
        } elsif (@$obj == 3 and $obj->[0] =~ /^[0-9]+$/ and
                 not ($Keys->{is_combining}->{$obj->[0]} or
                      $Keys->{is_enclosing}->{$obj->[0]}) and
                 $obj->[-2] eq 'hwid') {
          my $sk = join ' ', $obj->[0], $obj->[-1];
          my $sg = $key_to_gid->{$sk} // die "Bad |$key| ($sk)";
          
          my $gid2 = $key_to_gid->{$key} // $key_to_gid->{"$obj->[0] $obj->[-1] $obj->[-2]"} // die "Bad |$key|";

          $Data->{$obj->[-2]}->{$sg} = $gid2;
        } elsif (@$obj >= 3 and
                 not grep {
                   not (
                     /^[0-9]+$/ and
                     not ($Keys->{is_combining}->{$_} or
                          $Keys->{is_enclosing}->{$_})
                   );
                 } @$obj[0..($#$obj-2)] and
                 $obj->[-2] =~ /\A($ScriptFeatPattern)([0-9]+)\z/o) {
          my $so = [@$obj];
          pop @$so;
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk}};
          die "Bad |$sk|" unless defined $sg;
          
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }

          $Data->{$obj->[-1]}->{$sg} = $gid2;
        } elsif (@$obj == 4 and $obj->[0] =~ /^[0-9]+$/ and
                 not ($Keys->{is_combining}->{$obj->[0]} or
                      $Keys->{is_enclosing}->{$obj->[0]}) and
                 $Keys->{is_combining}->{$obj->[1]} and
                 $obj->[2] eq 'hwid') {
          my $so = [@$obj];
          pop @$so;
          
          my $gid2 = $key_to_gid->{$key}
              // $key_to_gid->{"$obj->[0] $obj->[1] $obj->[3] $obj->[2]"}
              // die "Bad |$key|";

            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $obj->[-1] . ' hwid'}
                // die "Bad |$so->[0] hwid $obj->[-1]| (@$obj)";
            push @gid1, $key_to_gid->{$so->[1]}
                // die "Bad |$so->[1]| (@$obj)";
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
        } elsif (@$obj == 4 and $obj->[0] =~ /^[0-9]+$/ and
                 not ($Keys->{is_combining}->{$obj->[0]} or
                      $Keys->{is_enclosing}->{$obj->[0]}) and
                 $Keys->{is_combining}->{$obj->[1]} and
                 $obj->[2] =~ /^MK[RCL][TMB][0-9]+$/) {
          my $so = [@$obj];
          pop @$so;
          
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }
          die unless defined $gid2;

            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $obj->[-1]}
                // die "Bad |$so->[0] $obj->[-1]| (@$obj)";
            push @gid1, $key_to_gid->{$so->[1] . ' ' . $obj->[2]}
                // die "Bad |$so->[1] $obj->[2]| (@$obj)";
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
        } else {
          die "Bad |@$obj|";
        }
      } elsif ($obj->[-1] eq 'hwid' or $obj->[-1] eq 'pwid') {
        my $so = [@$obj];
        pop @$so;
        if (@$so == 1 and $so->[0] =~ /^[0-9]+$/ and
            not $Keys->{is_combining}->{$so->[0]}) {
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk}};
          die "Bad |$sk|" unless defined $sg;
          
          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }
          
          $Data->{replaces}->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$so >= 3 and $so->[0] =~ /^[0-9]+$/ and
                 not grep { $Keys->{is_combining}->{$_} } @$so[0..$#$so-1] and
                 $so->[-1] =~ /\A($ScriptFeatPattern)([0-9]+)\z/o) {
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // die "Bad |@$so| (@$obj)";
          
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }

          $Data->{replaces}->{$obj->[-1]}->{$sg} = $gid2;
        } elsif (@$so >= 3 and $so->[0] =~ /^[0-9]+$/ and
                 not $Keys->{is_combining}->{$so->[0]} and
                 not grep { not $Keys->{is_combining}->{$_} } @$so[1..$#$so-1] and
                 $so->[-1] =~ /\A(MK..)([0-9]+)\z/o) {
          # [base] [combining]+ MK* hwid/pwid
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // die "Bad |@$so| (@$obj)";
          
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }

          $Data->{replaces}->{$obj->[-1]}->{$sg} = $gid2;
        } elsif (@$so == 2 and $so->[0] =~ /^[0-9]+$/ and
                 not $Keys->{is_combining}->{$so->[0]} and
                 ($so->[-1] eq 'SMAL' or
                  $so->[-1] =~ /\A($ScriptFeatPattern)([0-9]+)\z/o)) {
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk}};
          die "Bad |$sk|" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{replaces}->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$so >= 2 and $so->[0] =~ /^[0-9]+$/ and
                 not $Keys->{is_combining}->{$so->[0]} and
                 not grep { not $Keys->{is_combining}->{$_} } @$so[1..$#$so]) {
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }
          die $key unless defined $gid2;

          {
            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $obj->[-1]}
                // die "Bad |$so->[0] $obj->[-1]| (@$obj)";
            for (@$so[1..$#$so]) {
              push @gid1, $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
          }
          {
            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $obj->[-1]}
                // die "Bad |$so->[0] $obj->[-1]| (@$obj)";
            my $has = 0;
            for (@$so[1..$#$so]) {
              $has = 1 if defined $key_to_gid->{$_ . ' vert'};
              push @gid1, $key_to_gid->{$_ . ' vert'} // $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2] if $has;
          }
        } elsif (@$so >= 3 and $so->[0] =~ /^[0-9]+$/ and
                 not $Keys->{is_combining}->{$so->[0]} and
                 not grep { not $Keys->{is_combining}->{$_} } @$so[1..$#$so-1] and
                 ($so->[-1] eq 'SMAL' or
                  $so->[-1] =~ /\A($ScriptFeatPattern)([0-9]+)\z/o)) {
          # [base] [combining]+ SMAL hwid/pwid
          # [base] [combining]+ script hwid/pwid
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }
          die unless defined $gid2;

          {
            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $so->[-1] . ' ' . $obj->[-1]}
                // die "Bad |$so->[0] $so->[-1] $obj->[-1]| (@$obj)";
            for (@$so[1..$#$so-1]) {
              push @gid1, $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
          }
          {
            my @gid1;
            push @gid1, $key_to_gid->{$so->[0] . ' ' . $so->[-1] . ' ' . $obj->[-1]}
                // die "Bad |$so->[0] $so->[-1] $obj->[-1]| (@$obj)";
            my $has = 0;
            for (@$so[1..$#$so-1]) {
              $has = 1 if defined $key_to_gid->{$_ . ' vert'};
              push @gid1, $key_to_gid->{$_ . ' vert'} // $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2] if $has;
          }
        } else {
          die "Bad |@$obj|";
        }
      } elsif ($obj->[-1] =~ /\A($ScriptFeatPattern|KMOD|MK[LCR][TMB])([1-9][0-9]*|0)\z/o) {
        my $feat = $1;
        my $index = 0+$2;
        my $so = [@$obj];
        pop @$so;
        if (@$so == 1 or grep { not /\A[0-9]+\z/ } @$so) {
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk} // ''};
          if (not defined $sg and
              @$so == 3 and
              defined $key_to_gid->{$so->[1] . ' ' . $feat . $index} and
              $so->[2] =~ /\A($ScriptFeatPattern)([0-9]+)\z/o) {
            my $sfeat = $1;
            my $sindex = 0+$2;
            my @gid;
            push @gid, $key_to_gid->{$so->[0]} // die "Bad $sk";
            push @gid, $key_to_gid->{$so->[1] . ' ' . $feat . $index};
            
            my $gid;
            if (defined $key_alias->{$key}) {
              $gid = $key_to_gid->{$key_alias->{$key}};
            } else {
              $gid = $key_to_gid->{$key};
            }
            
            my $gid3 = $key_to_gid->{'Temp', @gid, $sfeat};
            if (defined $gid3) {
              $gid_to_lig->{$gid3}->[2]->[$sindex] = $gid;
            } else {
              my $gid3 = $key_to_gid->{'Temp', @gid, $sfeat} = put_glyph ['cmap', 'base', 0x3013];
              
              my $x = [];
              $x->[$sindex] = $gid;
              push @{$Data->{ligatures}->{$sfeat} ||= []},
                  $gid_to_lig->{$gid3} = [\@gid => $gid3 => $x];
            }
          } elsif (not defined $sg and
                   @$so == 4 and
                   defined $key_to_gid->{$so->[0] . ' ' . $so->[1] . ' ' . $so->[3]} and
                   $so->[2] =~ /\A[0-9]+\z/o) {
            my @gid;
            push @gid, $key_to_gid->{$so->[0] . ' ' . $so->[1] . ' ' . $so->[3]};
            push @gid, $key_to_gid->{$so->[2]} // die "Bad $sk";
            
            my $gid;
            if (defined $key_alias->{$key}) {
              $gid = $key_to_gid->{$key_alias->{$key}};
            } else {
              $gid = $key_to_gid->{$key};
            }
            
            my $gid3 = $key_to_gid->{'Temp', @gid, $feat};
            if (defined $gid3) {
              $gid_to_lig->{$gid3}->[2]->[$index] = $gid;
            } else {
              my $gid3 = $key_to_gid->{'Temp', @gid, $feat} = put_glyph ['cmap', 'base', 0x3013];
              
              my $x = [];
              $x->[$index] = $gid;
              push @{$Data->{ligatures}->{$feat} ||= []},
                  $gid_to_lig->{$gid3} = [\@gid => $gid3 => $x];
            }
          } else {
            die "Bad |$sk| (@$obj [$feat])" unless defined $sg;
            
            my $gid;
            if (defined $key_alias->{$key}) {
              $gid = $key_to_gid->{$key_alias->{$key}};
            } else {
              $gid = $key_to_gid->{$key};
            }
            
            $Data->{$feat}->{$sg}->[$index] = $gid;
          }
        } elsif ($feat =~ /^MK[RCL][TMB]$/) {
          if (@$so >= 2 and
              not grep { not $Keys->{is_combining}->{$_} } @$so) {
            my @gid = map {
              my $ss = $key_to_gid->{join ' ', $_, $feat . $index};
              die "Broken: |$key| ($_)" unless defined $ss;
              $ss;
            } @$so;

            my $gid;
            if (defined $key_alias->{$key}) {
              $gid = $key_to_gid->{$key_alias->{$key}};
            } else {
              $gid = $key_to_gid->{$key};
            }

            my $ccmp_type = 'cmb2';
            $ccmp_type = 'cmb3' if @$so >= 3;
            $ccmp_type = 'cmb4' if @$so >= 4;
            push @{$Data->{ccmp}->{$ccmp_type} ||= []}, [\@gid => $gid];
          } elsif (@$so >= 2 and $so->[0] =~ /\A[0-9]+\z/ and
                   not $Keys->{is_combining}->{$so->[0]} and
                   not grep { not $Keys->{is_combining}->{$_} } @$so[1..$#$so]) {
            # [base] [combining]+ MK..
            my @gid;
            for (@$so) {
              push @gid, $key_to_gid->{join ' ', $_, $feat . $index}
                  // $key_to_gid->{$_}
                  // die "Broken: |$key| ($_ $feat$index)";
            }
            
            my $gid;
            if (defined $key_alias->{$key}) {
              $gid = $key_to_gid->{$key_alias->{$key}};
            } else {
              $gid = $key_to_gid->{$key};
            }
            die unless defined $gid;
            
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid => $gid];
          } else {
            die "Bad ($key) |@$so|";
          }
        } elsif ($feat eq 'KMOD' and $so->[0] eq 0x2018) {
          my @gid = map {
            my $ss = $key_to_gid->{join ' ', $_, $feat . $index};
            die "Broken: |$key| ($_)" unless defined $ss;
            $ss;
          } @$so[0];
          push @gid, map {
            my $ss = $key_to_gid->{$_};
            die "Broken: |$key| ($_)" unless defined $ss;
            $ss;
          } @$so[1..$#$so];

            my $gid;
            if (defined $key_alias->{$key}) {
              $gid = $key_to_gid->{$key_alias->{$key}};
            } else {
              $gid = $key_to_gid->{$key};
            }
          die unless defined $gid;

          push @{$Data->{ccmp}->{fin} ||= []}, [\@gid => $gid];
        } else {
          my @gid;
          map {
            if (defined $Keys->{decomp}->{chr $_}) {
              for my $char (split //, $Keys->{decomp}->{chr $_}) {
                push @gid, $key_to_gid->{ord $char} // die;
              }
            } elsif (defined $Keys->{large}->{chr $_}) {
              push @gid, $key_to_gid->{(ord $Keys->{large}->{chr $_})} // die;
              push @gid, $Data->{named_glyphs}->{SMAL};
            } else {
              push @gid, $key_to_gid->{$_} // die;
            }
          } @$so;
          
          my $gid = $key_to_gid->{$key} // die;

          my $gid3 = $key_to_gid->{'Temp', @gid, $feat};
          if (defined $gid3) {
            $gid_to_lig->{$gid3}->[2]->[$index] = $gid;
          } else {
            my $gid3 = $key_to_gid->{'Temp', @gid, $feat} = put_glyph ['cmap', 'base', 0x3013];

            my $x = [];
            $x->[$index] = $gid;
            push @{$Data->{ligatures}->{$feat} ||= []},
                $gid_to_lig->{$gid3} = [\@gid => $gid3 => $x];
          }
        }
      } elsif ($obj->[-1] eq 'SQAR') {
        my $so = [@$obj];
        pop @$so;
        my $sk = join ' ', @$so;
        my @gid;
        for (@$so) {
          die "Bad |$_| (@$so)" unless /^[0-9]+$/;
          my $char = chr $_;
          for my $ch (split //, $char) {
            if (defined $Keys->{large}->{$ch}) {
              push @gid, $key_to_gid->{(ord $Keys->{large}->{$ch}) . ' SMAL'}
                  // die "Bad |$Keys->{large}->{$ch}| SMAL (@$so)";
              push @gid, $Data->{named_glyphs}->{small_modifier_l};
            } else {
              push @gid, $key_to_gid->{ord $ch} // die "Bad |$ch| (@$so)";
            }
          }
        }
        
          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

        push @{$Data->{$obj->[-1]} ||= []}, [\@gid => $gid];
      } elsif ($obj->[-1] eq 'WHIT' or
               $obj->[-1] eq 'SANB') {
        if (@$obj == 2 and $obj->[0] =~ /\A[0-9]+\z/) {
          my $sg = $key_to_gid->{$obj->[0]};
          die "Bad |$obj->[0]| (@$obj)" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$obj == 3 and $obj->[0] =~ /\A[0-9]+\z/ and
                 $obj->[1] =~ /\A($ScriptFeatPattern)([0-9]+)\z/o) {
          my $sg = $key_to_gid->{$obj->[0] . ' ' . $obj->[1]};
          die "Bad |$obj->[0] $obj->[1]| (@$obj)" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$obj == 3 and $obj->[0] =~ /\A[0-9]+\z/ and
                 $obj->[1] eq 'SMAL') {
          my $sg = $key_to_gid->{$obj->[0] . ' ' . $obj->[-1]};
          die "Bad |$obj->[0] $obj->[-1]| (@$obj)" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{$obj->[1]}->{$sg} = $gid;
        } elsif (@$obj == 3 and $obj->[0] =~ /\A[0-9]+\z/ and
                 ($Keys->{is_combining}->{$obj->[1]} or
                  $Keys->{is_enclosing}->{$obj->[1]})) {
          my @gid1;
          push @gid1, $key_to_gid->{$obj->[0] . ' ' . $obj->[-1]};
          die "Bad |$obj->[0] $obj->[-1]| (@$obj)" unless defined $gid1[0];
          push @gid1, $key_to_gid->{$obj->[1] . ' ' . $obj->[-1]}
              // $key_to_gid->{$obj->[1]};
          die "Bad |$obj->[1]| (@$obj)" unless defined $gid1[1];

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }
          die unless defined $gid;

          push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid];
        } else {
          die "Bad @$obj";
        }
      } elsif ($obj->[-1] eq 'LARG' or
               $obj->[-1] eq 'SMSM') {
        if (@$obj == 2 and $obj->[0] =~ /\A[0-9]+\z/) {
          my $sg = $key_to_gid->{$obj->[0]};
          die "Bad |$obj->[0]| (@$obj)" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$obj == 3 and $obj->[0] =~ /\A[0-9]+\z/ and
                 ($obj->[1] eq 'SMAL' or
                  $obj->[1] =~ /\A($ScriptFeatPattern)([0-9]+)\z/o)) {
          my $sg = $key_to_gid->{$obj->[0] . ' ' . $obj->[1]};
          die "Bad |$obj->[0] $obj->[1]| (@$obj)" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$obj == 3 and $obj->[0] =~ /\A[0-9]+\z/ and
                 ($Keys->{is_combining}->{$obj->[1]} or
                  $Keys->{is_enclosing}->{$obj->[1]})) {
          my @gid1;
          push @gid1, $key_to_gid->{$obj->[0] . ' ' . $obj->[-1]};
          die "Bad |$obj->[0] $obj->[-1]| (@$obj)" unless defined $gid1[0];
          push @gid1, $key_to_gid->{$obj->[1]};
          die "Bad |$obj->[1]| (@$obj)" unless defined $gid1[1];

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }
          die unless defined $gid;

          push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid];
        } else {
          die "Bad @$obj";
        }
      } elsif ($obj->[-1] eq 'vert' or
               $obj->[-1] eq 'WDLT' or
               $obj->[-1] eq 'WDRT') {
        my $so = [@$obj];
        pop @$so;

        my @gid;
        if (@$so == 1) {
          # [char] vert/WDLT/WDRT
          push @gid, $key_to_gid->{$so->[0]};
        } elsif (not grep { not /^[0-9]+$/ } @$so) {
          # [char]+ vert/WDLT/WDRT
          for (@$so) {
            my $x = $key_to_gid->{join ' ', $_, $obj->[-1]};
            if (defined $x) {
              push @gid, $x;
            } else {
              push @gid, $key_to_gid->{$_} // die $_;
            }
          }
        } elsif (not grep { not /^[0-9]+$/ } @$so[0..($#$so-1)] and
                 $so->[-1] eq 'SQAR') {
          # [char]+ SQAR vert/WDLT/WDRT
          push @gid, $key_to_gid->{join ' ', @$so[0..($#$so)]}
              // die "Bad |$key|";
        } elsif (not grep { not /^[0-9]+$/ } @$so[0..($#$so-1)] and
                 not $so->[-1] =~ /^[0-9]+$/) {
          # [char]+ [feat] vert/WDLT/WDRT
          for (@$so[0..($#$so-1)]) {
            push @gid, $key_to_gid->{join ' ', $_, $so->[-1]}
                // $key_to_gid->{$_} // die "Bad |$key|: $_";
          }
        } elsif (not grep { not /^[0-9]+$/ } @$so[0..($#$so-2)] and
                 not $so->[-2] =~ /^[0-9]+$/ and
                 not $so->[-1] =~ /^[0-9]+$/) {
          # [char]+ [feat] [feat] vert/WDLT/WDRT
          for (@$so[0..($#$so-2)]) {
            push @gid, $key_to_gid->{join ' ', $_, $so->[-2], $so->[-1]}
                // $key_to_gid->{join ' ', $_, $so->[-2]}
                // $key_to_gid->{$_} // die $_;
          }
        } else {
          die $key;
        }
        
        my $gid = $key_to_gid->{$key} // die;

        if (@gid == 1) {
          $Data->{replaces}->{$obj->[-1]}->{$gid[0]} = $gid;
          $Data->{replaces}->{vrt2}->{$gid[0]} //= $gid if $obj->[-1] eq 'vert';
        } else {
          push @{$Data->{ccmp}->{main} ||= []}, [\@gid => $gid];
        }
      } elsif ($obj->[-1] eq 'vrt2') {
        if (@$obj == 3 and $obj->[0] =~ /^[0-9]+$/ and
            not ($Keys->{is_combining}->{$obj->[0]} or
                 $Keys->{is_enclosing}->{$obj->[0]}) and
            $obj->[1] eq 'hwid') {
          my $so = [@$obj];
          pop @$so;
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk}};
          die "Bad |$sk|" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{replaces}->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$obj == 4 and $obj->[0] =~ /^[0-9]+$/ and
                 not ($Keys->{is_combining}->{$obj->[0]} or
                      $Keys->{is_enclosing}->{$obj->[0]}) and
                 $obj->[1] eq 'SMAL' and
                 $obj->[2] eq 'hwid') {
          my $so = [@$obj];
          pop @$so;
          my $sk = join ' ', @$so;
          my $sg = $key_to_gid->{$sk} // $key_to_gid->{$key_alias->{$sk}};
          die "Bad |$sk|" unless defined $sg;

          my $gid;
          if (defined $key_alias->{$key}) {
            $gid = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid = $key_to_gid->{$key};
          }

          $Data->{replaces}->{$obj->[-1]}->{$sg} = $gid;
        } elsif (@$obj == 4 and $obj->[0] =~ /^[0-9]+$/ and
                 not ($Keys->{is_combining}->{$obj->[0]} or
                      $Keys->{is_enclosing}->{$obj->[0]}) and
                 $Keys->{is_combining}->{$obj->[1]} and
                 $obj->[2] eq 'hwid') {
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }
          die unless defined $gid2;

          {
            my @gid1;
            push @gid1, $key_to_gid->{$obj->[0] . ' ' . $obj->[-2] . ' ' . $obj->[-1]}
                // die "Bad |$obj->[0] $obj->[-2] $obj->[-1]| (@$obj)";
            for ($obj->[1]) {
              push @gid1, $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
          }
          {
            my @gid1;
            push @gid1, $key_to_gid->{$obj->[0] . ' ' . $obj->[-2] . ' ' . $obj->[-1]}
                // die "Bad |$obj->[0] $obj->[-2] $obj->[-1]| (@$obj)";
            my $has = 0;
            for ($obj->[1]) {
              $has = 1 if defined $key_to_gid->{$_ . ' vert'};
              push @gid1, $key_to_gid->{$_ . ' vert'} // $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2] if $has;
          }
        } elsif (@$obj == 5 and $obj->[0] =~ /^[0-9]+$/ and
                 not ($Keys->{is_combining}->{$obj->[0]} or
                      $Keys->{is_enclosing}->{$obj->[0]}) and
                 $Keys->{is_combining}->{$obj->[1]} and
                 $obj->[2] eq 'SMAL' and
                 $obj->[3] eq 'hwid') {
          my $gid2;
          if (defined $key_alias->{$key}) {
            $gid2 = $key_to_gid->{$key_alias->{$key}};
          } else {
            $gid2 = $key_to_gid->{$key};
          }
          die unless defined $gid2;

          {
            my @gid1;
            push @gid1, $key_to_gid->{$obj->[0] . ' ' . $obj->[-3] . ' ' . $obj->[-2] . ' ' . $obj->[-1]}
                // die "Bad |$obj->[0] $obj->[-3] $obj->[-2] $obj->[-1]| (@$obj)";
            for ($obj->[1]) {
              push @gid1, $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2];
          }
          {
            my @gid1;
            push @gid1, $key_to_gid->{$obj->[0] . ' ' . $obj->[-3] . ' ' . $obj->[-2] . ' ' . $obj->[-1]}
                // die "Bad |$obj->[0] $obj->[-3] $obj->[-2] $obj->[-1]| (@$obj)";
            my $has = 0;
            for ($obj->[1]) {
              $has = 1 if defined $key_to_gid->{$_ . ' vert'};
              push @gid1, $key_to_gid->{$_ . ' vert'} // $key_to_gid->{$_} // die "Bad |$_| (@$obj)";
            }
            push @{$Data->{ccmp}->{main} ||= []}, [\@gid1 => $gid2] if $has;
          }
        } else {
          die "Bad |$key|";
        }
      } else {
        die "Bad |$key|";
      }
    }
  } # $key

  {
    my $found = [[-100, -100]];
    for (sort { $a <=> $b } keys %$aj) {
      if ($found->[-1]->[1] + 1 == $_) {
        $found->[-1]->[1] = $_;
      } else {
        push @$found, [$_, $_];
      }
    }
    shift @$found;
    warn "AJ: " . (join ', ', map { "$_->[0]-$_->[1]" } @$found) . "\n"
        if @$found;
  }
  {
    my $found = [[-100, -100]];
    for (sort { $a <=> $b } keys %$am) {
      if ($found->[-1]->[1] + 1 == $_) {
        $found->[-1]->[1] = $_;
      } else {
        push @$found, [$_, $_];
      }
    }
    shift @$found;
    warn "AM: " . (join ', ', map { "$_->[0]-$_->[1]" } @$found) . "\n"
        if @$found;
  }

  $Data->{cmap}->{0x00A0} = $Data->{cmap}->{0x3000} = $Data->{cmap}->{0x2003}
      = $Data->{cmap}->{0x0020};
  $Data->{cmap}->{0x02BB} = $Data->{cmap}->{0x2018};
  $Data->{cmap}->{0x02BC} = $Data->{cmap}->{0x2019};
  for my $c1 (sort { $a cmp $b } keys %{$Keys->{decomp}}) {
    my $char = $Keys->{decomp}->{$c1};
    while ($char =~ /^(.)/ and defined $Keys->{decomp}->{$1}) {
      $char =~ s/^(.)/$Keys->{decomp}->{$1}/;
    }
    next if not defined $Data->{cmap}->{ord $char} or
            not defined $key_to_gid->{join ' ', map { ord $_ } split //, $char};

    my $gid3 = put_glyph ['cmap', 'base', 0x3013];
    $key_to_gid->{ord $c1} = $Data->{cmap}->{ord $c1} = $gid3;
    push @{$Data->{ccmp}->{de} ||= []}, [
      $gid3, [
        map {
          $key_to_gid->{ord $_} // die "Bad $c1 ($_)";
        } split //, $char,
      ],
    ];
  }
  for my $c1 (sort { $a cmp $b } keys %{$Keys->{large}}) {
    my $char = $Keys->{large}->{$c1};
    next unless defined $Data->{cmap}->{ord $char};
    
    my $gid3 = put_glyph ['cmap', 'base', 0x3013];
    
    $key_to_gid->{ord $c1} = $Data->{cmap}->{ord $c1} = $gid3;
    push @{$Data->{ccmp}->{de} ||= []}, [
      $gid3, [
        (map {
          $key_to_gid->{join ' ', ord $_} // die "Bad $c1 ($_)";
        } split //, $char),
        $Data->{named_glyphs}->{SMAL},
      ],
    ];
  }
  for my $c1 (sort { $a cmp $b } keys %{$Keys->{fw}}) {
    if (defined $Keys->{large}->{$Keys->{fw}->{$c1}}) {
      my $char = $Keys->{large}->{$Keys->{fw}->{$c1}};
      next unless defined $Data->{cmap}->{ord $char};
      
      my $gid3 = put_glyph ['cmap', 'base', 0x3013];
      
      $key_to_gid->{ord $c1} = $Data->{cmap}->{ord $c1} = $gid3;
      push @{$Data->{ccmp}->{de} ||= []}, [
        $gid3, [
          (map {
            $key_to_gid->{join ' ', ord $_} // die "Bad $c1 ($_)";
          } split //, $char),
          $Data->{named_glyphs}->{SMAL},
          $Data->{named_glyphs}->{hwid},
        ],
      ];
      push @$shown_objs, [ord $Keys->{hw}->{$Keys->{large}->{$Keys->{fw}->{$c1}}}, 'SMAL', 'fwid'];
    } else {
      my $char = $Keys->{fw}->{$c1};
      next unless defined $Data->{cmap}->{ord $char};
      
      my $gid3 = put_glyph ['cmap', 'base', 0x3013];
      
      $key_to_gid->{ord $c1} = $Data->{cmap}->{ord $c1} = $gid3;
      push @{$Data->{ccmp}->{de} ||= []}, [
        $gid3, [
          (map {
            $key_to_gid->{join ' ', ord $_} // die "Bad $c1 ($_)";
          } split //, $char),
          $Data->{named_glyphs}->{hwid},
        ],
      ];
      push @$shown_objs, [ord $c1, 'fwid'];
    }
  }
  if (defined $Data->{cmap}->{0x3033}) {
    for (
      [[0x3033, 0x3035] => 0x3031],
      [[0x3033 . ' ' .  0x3099, 0x3035] => 0x3031 . ' ' . 0x3099],
      [[0x3033 . ' ' . 0x309A, 0x3035] => 0x3031 . ' ' . 0x309A],
    ) {
      {
        my @gid1 = map {
          $key_to_gid->{$_} // die "Bad $_";
        } @{$_->[0]};
        my $gid2 = $key_to_gid->{$_->[1]} // die "Bad $_->[1]";
        push @{$Data->{ccmp}->{con} ||= []}, [\@gid1 => $gid2];
      }
      {
        my @gid1 = map {
          $key_to_gid->{$_ . ' vert'} // $key_to_gid->{$_} // die "Bad $_";
        } @{$_->[0]};
        my $gid2 = $key_to_gid->{$_->[1] . ' vert'} 
            // $key_to_gid->{$_->[1]} // die "Bad $_->[1]";
        push @{$Data->{ccmp}->{con} ||= []}, [\@gid1 => $gid2];
      }
    }
  } # 0x3033

  for my $obj (@$shown_objs) {
    my $key = join ' ', @$obj;
    next if defined $key_to_subitems->{$key};
    
    $key_to_obj->{$key} = $obj;
    $key_to_subitems->{$key} = [];
  }
}

if (defined $Keys->{output_file_names}->{font_map}) {
  my $map = {};
  
  ## Construct a font selection rules
  $map->{feature_classes} = my $features = {};
  for my $key (sort { $a cmp $b } keys %{$Keys->{font}}) {
    my @k1;
    my @k2;
    my @k3;
    map {
      if (/^[0-9]+$/) {
        my $x = sprintf ('%x', $_);
        push @k1, $x;
      } elsif (/^([A-Za-z]{4})([0-9]+)$/) {
        $features->{$_} = "'$1' @{[$2+1]}";
        push @k2, $_;
      } else {
        $features->{$_} = "'$_' 1";
        push @k3, $_;
      }
    } grep { length } split / /, $key;
    @k2 = sort { $a cmp $b } @k2;
    @k3 = sort { $a cmp $b } @k3;
    my @item;
    for my $k (sort { $a cmp $b } keys %{$Keys->{font}->{$key}}) {
      my $font = $Keys->{font}->{$key}->{$k};

      my @k4 = sort { $a cmp $b } grep { length } map {
        my $tag = $Keys->{tags}->{index_to_tag}->[0+$_];
        my $key = $Keys->{tags}->{index_to_key}->[0+$_];
        $features->{$key} = "'$tag' 1";
        $key;
      } split / /, $k;

      my @k = (@k1, '/', @k2, @k3, @k4);
      pop @k if $k[-1] eq '/';

      if (@k == 1 and $font == 1) {
        #
      } else {
        push @item, [\@k, $font];
      }
    } # $k
    $map->{font_map}->{''} = 1;
    my $y = sub { my $s = $_[0]; $s =~ s{\./\.}{/}g; $s };
    X: for my $x (sort { @{$a->[0]} <=> @{$b->[0]} } @item) {
      my $font = $x->[1];
      my @c = @{$x->[0]};
      pop @c;
      C: {
        my $v = $map->{font_map}->{$y->(join '.', @c)};
        if (defined $v and $v != $font) {
          last C;
        } elsif (defined $v and $v == $font) {
          next X;
        }
        pop @c;
        redo C;
      } # C
      
      $map->{font_map}->{$y->(join '.', @{$x->[0]})} = $font;
    } # X
  }
  $map->{feature_fonts} = $Keys->{fonts}->{feature_fonts} || {};

  my $out_path = path ($Keys->{output_file_names}->{font_map});
  $out_path->spew (perl2json_bytes_for_record $map);
}

if (defined $Keys->{output_file_names}->{glyph_names}) {
  my $out_path = path ($Keys->{output_file_names}->{glyph_names});
  $out_path->spew (perl2json_bytes_for_record {
    chars => {
      "" => {
        vs => [sort { $a cmp $b } keys %GWName],
      },
    },
  });
}

if (defined $Keys->{output_file_names}->{kgmap}) {
  local $Data->{items};
  delete $Data->{items};
  unless ($Keys->{with}->{scripts}) {
    delete $Data->{$_} for qw(
      AWID hwid fwid pwid salt hkna vkna ruby OCRF SANB
      MKRT MKRM MKRB MKCB MKLB MKLM MKLT MKCT MKCM
      SQAR
    ); # SMAL
    delete $Data->{replaces}->{$_} for qw(
      vrt2 WDLT WDRT SMLQ SMLO pwid
    ),
    'SMLB', 'SMCB', 'SMRB', 'SMLM', 'SMCM', 'SMRM', 'SMLT', 'SMCT', 'SMRT',
    'SMPB', 'SMPM', 'SMPT', 'SMLP', 'SMCP', 'SMRP',
    ;
    for (@{$Data->{variant_tags}}) {
      delete $Data->{$_};
    }
    $Data->{variant_tags} = [];
  }
  my $out_path = path ($Keys->{output_file_names}->{kgmap});
  $out_path->spew (perl2json_bytes_for_record $Data);
}

if (defined $Keys->{output_file_names}->{keys}) {
  my $x = {};
  for (qw(
    combining_chars comp for_file hw is_combining is_enclosing
    is_sqar_enclosing label_to_tag objs script_feature_tags
    small subitems tag_labels_html tags key_to_default_subitem
  )) {
    $x->{$_} = $Keys->{$_};
  }
  my $out_path = path ($Keys->{output_file_names}->{keys});
  $out_path->spew (perl2json_bytes_for_record $x);
}

for my $font_key (keys %{$Data->{fonts}->{parts}}) {
  my $name = $Data->{fonts}->{parts}->{$font_key}->{ranges_file_name};
  next unless defined $name;
  my $path = path ($name);

  my $codes = {};
  for my $key (keys %{$Keys->{key_to_default_subitem}}) {
    next unless $key =~ /^[0-9]+(?: [0-9]+)*$/;
    my $subitem = $Keys->{key_to_default_subitem}->{$key};
    if ($subitem->{_font} eq $font_key) {
      for (split / /, $key) {
        $codes->{$_} = 1 unless $Data->{fonts}->{parts}->{$font_key}->{ranges_excluded}->{$_};
      }
    }
  }

  my $list = [[-100, -100]];
  for (sort { $a <=> $b } keys %$codes) {
    if ($list->[-1]->[1] + 1 == $_) {
      $list->[-1]->[1] = $_;
    } else {
      push @$list, [$_, $_];
    }
  }
  shift @$list;

  $path->spew (join ',', map {
    if ($_->[0] == $_->[1]) {
      sprintf 'U+%04X', $_->[0];
    } else {
      sprintf 'U+%04X-%04X', @$_;
    }
  } @$list);
}

## License: Public Domain.
