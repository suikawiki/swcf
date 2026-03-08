use strict;
use warnings;

our $Keys;
our $Data;

$Keys->{gmap_file_names} = [map { ($ENV{GMAP_PATH} // '') . $_ } 
  'swir-gmap.json',
];
$Keys->{input_file_names} = {};
$Keys->{output_file_names} = {
  kgmap => 'kana3-kgmap.json',
  font_map => 'kana3-fontmap.json',
};

$Data->{fonts}->{parts} = {
  2 => {
    name => 'SWCF Kana3 B',
    outFileName=> 'kana3b.ttf',
    source_keys => [],
    baseFontKey=> 'frq0',
    license_type => 'ccbysa40',
  },
};

for (
  [frq0 => 'frq0.ttf'],
      
  [ep => 'ep.json', type => 'ep', allowed_legal_keys => {
    "-ddsd-ndl-PDM" => 1,
    "CC-PDM-1.0" => 1,
    "CC-BY-4.0" => 1,
    "CC-BY-SA-4.0" => 1,
  }],
) {
  my ($key, $file_name, %opts) = @$_;
  $Data->{fonts}->{sources}->{$key}->{file_name} = $file_name;
  for (keys %opts) {
    $Data->{fonts}->{sources}->{$key}->{$_} = $opts{$_};
  }
  $Data->{fonts}->{sources}->{$key}->{part_key} = 2;
  push @{$Data->{fonts}->{parts}->{2}->{source_keys}}, $key;
}

1;

## License: Public Domain.
