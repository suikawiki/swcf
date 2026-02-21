use strict;
use warnings;
use utf8;
use Path::Tiny;
use JSON::PS;

my $ScriptTags = {qw(
  田山 田山文字
  盛岡 盛岡文字
  日本新字 日本新字
  安寺持方数字 安寺持方数字
)};

my $Data = {};

my $Defs = {};

for (<>) {
  chomp;
  my $path = path ($_);
  my $json = json_bytes2perl $path->slurp;

    my $item_key_to_data = {};
    for my $item (@{$json->{items}}) {
      my $data = {
        item_type => $item->{type},
        image_key => $json->{image}->{key},
        item_key => $item->{key},
        tags => {},
        size => $item->{regionSize} || 0,
        _sub => $item->{subItemKeys},
        _super => $item->{superItemKeys},
      };
      $data->{transform_key} = $json->{image}->{transformKey}
          if defined $json->{image}->{transformKey};
      $item_key_to_data->{$data->{item_key}} = $data;

      my $value = $item->{value};
      $value =~ s/\A\s+//;
      $value =~ s/\s+\z//;
      if ($value =~ s/\$([0-9]+)$//) {
        # XXXbackcompat
      }
      while ($value =~ s/#([^#]+)$//) {
        $data->{tags}->{$1} = 1;
      }
      $data->{value} = $value;

      if (defined $item->{regionKey}) { # character, component, cluster
        $data->{image_source} = $json->{image};
        $data->{image_region}->{region_key} = $item->{regionKey};
        $data->{region_ref} = ':ep-' . (defined $data->{transform_key} ? 'x' . $data->{transform_key} . '-' : '') . $data->{image_key} . '-' . $data->{image_region}->{region_key};
      }
    } # $item
    for my $data (sort { $a->{item_key} cmp $b->{item_key} } values %{$item_key_to_data}) {
      if ($data->{item_type} eq 'sizeref' or $data->{item_type} eq 'cluster') {
        my $datas = [map { $item_key_to_data->{$_} // () } @{$data->{_sub} or []}];
        next unless @$datas;
        my $ref_data = [grep { $_->{tags}->{sizeref} and defined $_->{region_ref} } @$datas]->[0];
        next if not defined $ref_data and $data->{item_type} eq 'cluster';
        $ref_data //= [grep { defined $_->{region_ref} } @$datas]->[0];
        next unless defined $ref_data;
        for my $data (@$datas) {
          next if $data eq $ref_data;
          $data->{size_ref} = $ref_data->{region_ref};
        }
        if ($data->{item_type} eq 'cluster' and not $data eq $ref_data) {
          $data->{size_ref} = $ref_data->{region_ref};
        }
      }

    }
    for my $data (sort { $a->{item_key} cmp $b->{item_key} } values %{$item_key_to_data}) {
      for my $key (@{$data->{_super} or []}) {
        my $sd = $item_key_to_data->{$key};
        $data->{tags}->{$_} = 1 for keys %{$sd->{tags} or {}};
      }

      $data->{tags}->{$_} = 1 for keys %{$Defs->{ref_tags}->{$data->{region_ref} // ''} or {}};
      $data->{tags}->{noglyph} = 1 if $data->{item_type} eq 'annotation';

      my $style = 0;
      for (1..8) { # u1 u2 ... u8
        $style = $_ if $data->{tags}->{'u'.$_};
      }
      $data->{_style} = $style;
      $style ||= 1;
      my $variant = 0;
      for (1..5) { # v1 v2 v3 v4 v5
        $variant = $_ if $data->{tags}->{'v'.$_};
      }
      $data->{_variant} = $variant;
      $variant ||= 1;
      $variant = "縦$variant" if $data->{tags}->{縦};
      $data->{_category} = 9;
      {
        $data->{_category} = 1 if $data->{tags}->{現存};
        $data->{_category} = 2 if $data->{tags}->{消失};
        $data->{_category} = 3 if $data->{tags}->{模造};
        $data->{_category} = 4 if $data->{tags}->{掲載};
        $data->{_category} = 5 if $data->{tags}->{類似};
      }
      my $script = 0;
      for (keys %$ScriptTags) {
        $script = $ScriptTags->{$_} if $data->{tags}->{$_};
      }
      $data->{group_key} = join $;,
          $script,
          $data->{value},
          $variant,
          $style;
      
      if (defined $data->{image_region}) {
        die "Duplicate |$data->{region_ref}|"
            if defined $Data->{items}->{$data->{region_ref}};
        $Data->{items}->{$data->{region_ref}} = $data;

        $Data->{groups}->{$data->{group_key}}->{script} = $script;
        $Data->{groups}->{$data->{group_key}}->{value} = $data->{value};
        $Data->{groups}->{$data->{group_key}}->{variant} = $variant;
        $Data->{groups}->{$data->{group_key}}->{style} = $style;
        push @{$Data->{groups}->{$data->{group_key}}->{region_refs} ||= []}, $data->{region_ref}; # will be reordered later
      }
    } # $data
}

{
  for my $group_key (keys %{$Data->{groups}}) {
    my $region_refs = $Data->{groups}->{$group_key}->{region_refs} = [map { $_->{region_ref} } sort {
      $b->{_variant} <=> $a->{_variant} ||
      $b->{_style} <=> $a->{_style} ||
      ($b->{tags}->{free} || 0) <=> ($a->{tags}->{free} || 0) ||
      ($a->{tags}->{noglyph} || 0) <=> ($b->{tags}->{noglyph} || 0) ||
      $a->{_category} <=> $b->{_category} || 
      ($a->{tags}->{bad4us} || 0) <=> ($b->{tags}->{bad4us} || 0) ||
      ($a->{tags}->{断} || 0) <=> ($b->{tags}->{断} || 0) ||
      ($a->{tags}->{損} || 0) <=> ($b->{tags}->{損} || 0) ||
      ($a->{tags}->{重} || 0) <=> ($b->{tags}->{重} || 0) ||
      ($a->{tags}->{白抜き} || 0) <=> ($b->{tags}->{白抜き} || 0) ||
      ($a->{tags}->{汚} || $a->{tags}->{折} || 0) <=> ($b->{tags}->{汚} || $b->{tags}->{折} || 0) ||
      ($a->{tags}->{かすれ} || $a->{tags}->{歪} || 0) <=> ($b->{tags}->{かすれ} || $b->{tags}->{歪} || 0) ||
      ($a->{tags}->{接} || 0) <=> ($b->{tags}->{接} || 0) ||
      ($a->{tags}->{続} || 0) <=> ($b->{tags}->{続} || 0) ||
      $b->{size} <=> $a->{size};
    } map { $Data->{items}->{$_} } @{$Data->{groups}->{$group_key}->{region_refs}}];

    my $items = [grep { $_->{tags}->{free} } grep { not $_->{tags}->{noglyph} } map { $Data->{items}->{$_} } @$region_refs];
    if (@$items) {
      $Data->{groups}->{$group_key}->{chosen_region_ref} = $items->[0]->{region_ref};
    }
  } # $group_key
}

{
  for (@{[keys %$Data]}) {
    delete $Data->{$_} if /^_/;
  }
  for my $data (values %{$Data->{items}}) {
    for (@{[keys %$data]}) {
      delete $data->{$_} if /^_/;
    }
  }
  
  print perl2json_bytes_for_record $Data;
}

## License: Public Domain.

__END__

Tags

  bad4us        Not suitable for our processing.
  free          Free image.
  noglyph       Not used as a glyph source.
  rt            Marked as %tfmarkrt.
  sizeref       Used as a reference image to determine the dimension.
  続            Connected cursively.
  白抜き        White foreground.
  折            On crease.
  かすれ        Crooked.
  重            Something overlaps.
  接            Graphically connected to neighbors.
  損            Broken.
  断            Partial.
  歪            Distorted.
  汚            Dirty.

  Scripts:
  
  盛岡          盛岡文字.
  田山          田山文字.
  日本新字      日本新字.
  安寺持方数字  安寺持方数字.
  横            Horizontally composed ligature.
  縦            Vertically composed ligature.

  Glyph classifications:
  
  v1 v2 v3 v4 v5 Variant ID.
  u1 u2 .. u8   Style difference ID.
  d1 d2         Voiced mark differences.

  Source types:  
  
  現存
  消失
  模造
  掲載
  類似
